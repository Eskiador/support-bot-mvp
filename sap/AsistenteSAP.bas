Attribute VB_Name = "AsistenteSAP"
Option Explicit

' ==================================================================
'  ASISTENTE SAP PARA EL ZNET DE LOS ABONOS  (version 3)
'  VA01 > ZG2 Sol.abono GAC > Datos de posicion > Condiciones
'
'  Hace TODAS las posiciones de un tiron, una sola visita a cada una:
'   1. Lee el numero de posicion. Si no esta en la lista, la salta.
'   2. Ctrl+Fin (fila en blanco) y escribe ZNET de prueba (10 por 100).
'   3. Intro y lee el Neto de arriba.
'   4. Calcula el ZNET definitivo = importe x 10 / neto leido.
'   5. Busca en la tabla la casilla Importe que dice "10,00" (la del
'      ZNET recien puesto) y lo sustituye por el definitivo.
'   6. Intro y vuelve a leer el Neto: tiene que dar el importe. Si no
'      lo da, corrige una vez; si sigue sin darlo, se para ahi.
'   7. Mayus+F7 a la siguiente posicion.
'  Lo que no cuadre por los 2 decimales del ZNET se arrastra a la
'  linea siguiente; lo que sobre al final es el ZAJU de cabecera.
'
'  SAP no deja copiar con el teclado: las casillas se leen
'  seleccionandolas con el raton y Ctrl+C. Por eso hay que CALIBRAR
'  una vez donde estan (boton "Calibrar"), con la ventana de SAP
'  siempre del mismo tamano.
'
'  Lo que NO hace nunca:
'   - Grabar. Al acabar te dice el total y el ZAJU, y grabas tu.
'   - Escribir si la ventana activa no es la de Datos de posicion
'     del Sol.abono, o si sale un aviso (otra ventana delante).
'   - Escribir el definitivo en una casilla que no diga "10,00".
'
'  Para pararlo: mueve el raton con fuerza o pulsa la tecla Pausa.
' ==================================================================

Private Type PUNTO
    x As Long
    y As Long
End Type

Private Type RECTANGULO
    Izq As Long
    Arr As Long
    Der As Long
    Aba As Long
End Type

Private Declare PtrSafe Function FindWindow Lib "user32" Alias "FindWindowA" (ByVal lpClassName As String, ByVal lpWindowName As String) As LongPtr
Private Declare PtrSafe Function SetForegroundWindow Lib "user32" (ByVal hWnd As LongPtr) As Long
Private Declare PtrSafe Function GetForegroundWindow Lib "user32" () As LongPtr
Private Declare PtrSafe Function GetWindowText Lib "user32" Alias "GetWindowTextA" (ByVal hWnd As LongPtr, ByVal lpString As String, ByVal cch As Long) As Long
Private Declare PtrSafe Function IsIconic Lib "user32" (ByVal hWnd As LongPtr) As Long
Private Declare PtrSafe Function ShowWindow Lib "user32" (ByVal hWnd As LongPtr, ByVal nCmdShow As Long) As Long
Private Declare PtrSafe Function GetWindowRect Lib "user32" (ByVal hWnd As LongPtr, lpRect As RECTANGULO) As Long
Private Declare PtrSafe Function GetCursorPos Lib "user32" (lpPoint As PUNTO) As Long
Private Declare PtrSafe Function SetCursorPos Lib "user32" (ByVal x As Long, ByVal y As Long) As Long
Private Declare PtrSafe Sub mouse_event Lib "user32" (ByVal dwFlags As Long, ByVal dx As Long, ByVal dy As Long, ByVal cButtons As Long, ByVal dwExtraInfo As LongPtr)
Private Declare PtrSafe Function GetAsyncKeyState Lib "user32" (ByVal vKey As Long) As Integer
Private Declare PtrSafe Function OpenClipboard Lib "user32" (ByVal hWnd As LongPtr) As Long
Private Declare PtrSafe Function CloseClipboard Lib "user32" () As Long
Private Declare PtrSafe Function EmptyClipboard Lib "user32" () As Long
Private Declare PtrSafe Function GetClipboardData Lib "user32" (ByVal wFormat As Long) As LongPtr
Private Declare PtrSafe Function GlobalLock Lib "kernel32" (ByVal hMem As LongPtr) As LongPtr
Private Declare PtrSafe Function GlobalUnlock Lib "kernel32" (ByVal hMem As LongPtr) As Long
Private Declare PtrSafe Function lstrlenW Lib "kernel32" (ByVal lpString As LongPtr) As Long
Private Declare PtrSafe Sub CopyMemory Lib "kernel32" Alias "RtlMoveMemory" (ByVal Destino As LongPtr, ByVal Origen As LongPtr, ByVal Bytes As LongPtr)
Private Declare PtrSafe Sub Sleep Lib "kernel32" (ByVal dwMilliseconds As Long)

Private Const HOJA As String = "Asistente SAP"
Private Const TITULO_MSG As String = "Asistente SAP"
Private Const SAP_CLASE As String = "SAP_FRONTEND_SESSION"

' Configuracion (celdas amarillas)
Private Const C_PAUSA As String = "C3"
Private Const C_SEP As String = "C4"
Private Const C_TITULO As String = "C5"
Private Const C_SECUENCIA As String = "C6"
Private Const C_PRUEBA As String = "C7"
Private Const C_ESPERA As String = "C8"
Private Const C_FILAS As String = "C9"
Private Const C_CALIB As String = "F3"
' Tp > (Tab) Descripcion > (Tab) Importe > (Tab) Moneda > (Tab) por
Private Const SECUENCIA_ZNET As String = "ZNET{TAB}{TAB}{PRUEBA}{TAB}{TAB}100"
Private Const SECUENCIA_V3_MALA As String = "ZNET{TAB}{PRUEBA}{TAB}{TAB}100"
Private Const C_PAUSA_CAMPO As String = "F5"   ' pausa extra al cambiar de casilla (Tab / Intro)

' Calibracion: columna AA oculta. Todo relativo a la esquina de la ventana.
Private Const COL_CAL As String = "AA"
Private Const CAL_ANCHO As Long = 1
Private Const CAL_ALTO As Long = 2
Private Const CAL_POS_I As Long = 3
Private Const CAL_POS_D As Long = 4
Private Const CAL_NETO_I As Long = 5
Private Const CAL_NETO_D As Long = 6
Private Const CAL_IMP_I As Long = 7
Private Const CAL_IMP_D As Long = 8
Private Const CAL_IMP_2 As Long = 9
Private Const CAL_N As Long = 9

' Tabla de posiciones
Private Const FILA_CAB As Long = 11
Private Const FILA_INI As Long = 12
Private Const NUM_FILAS As Long = 200
Private Const COL_POS As Long = 2       ' B  Pos.
Private Const COL_OBJ As Long = 3       ' C  Importe a abonar (neto que tiene que dar)
Private Const COL_DESC As Long = 4      ' D  Descripcion
Private Const COL_NPRUEBA As Long = 5   ' E  Neto con el ZNET de prueba
Private Const COL_ZNET As Long = 6      ' F  ZNET definitivo escrito
Private Const COL_NFINAL As Long = 7    ' G  Neto final leido en SAP
Private Const COL_ESTADO As Long = 8    ' H  Estado

Private Const VK_CONTROL As Long = &H11
Private Const VK_PAUSA As Long = &H13
Private Const RATON_ABAJO As Long = &H2
Private Const RATON_ARRIBA As Long = &H4
Private Const CF_UNICODETEXT As Long = 13

' Estado de una ejecucion
Private mVentana As LongPtr
Private mRect As RECTANGULO
Private mShell As Object
Private mPausa As Long
Private mPausaCampo As Long
Private mRequisitos As String
Private mSep As String
Private mUltimoRaton As PUNTO
Private mMotivo As String
Private mFilaZnet As Long        ' fila de la tabla donde aparecio el ZNET la ultima vez


' ------------------------------------------------------------------
'  PREPARAR LA HOJA (una sola vez, con Alt+F8)
' ------------------------------------------------------------------
Public Sub PrepararHoja()
    Dim ws As Worksheet, i As Long, x As Double, cal(1 To CAL_N) As Variant

    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(HOJA)
    On Error GoTo 0
    If ws Is Nothing Then
        Set ws = ThisWorkbook.Worksheets.Add(Before:=ThisWorkbook.Worksheets(1))
        ws.Name = HOJA
    ElseIf MsgBox("La hoja '" & HOJA & "' ya existe y se va a rehacer desde cero." & vbCrLf & _
                  "Se pierden las posiciones pegadas (la calibracion se conserva). Continuar?", _
                  vbOKCancel + vbExclamation, TITULO_MSG) <> vbOK Then
        Exit Sub
    End If

    For i = 1 To CAL_N
        cal(i) = ws.Range(COL_CAL & i).Value
    Next i

    ws.Cells.Clear
    ws.Cells.Validation.Delete
    For i = ws.Shapes.Count To 1 Step -1
        ws.Shapes(i).Delete
    Next i

    ws.Cells.Font.Name = "Segoe UI"
    ws.Cells.Font.Size = 10

    With ws.Range("A1")
        .Value = "Asistente SAP - ZNET de los abonos"
        .Font.Size = 16
        .Font.Bold = True
        .Font.Color = RGB(10, 110, 209)
    End With
    With ws.Range("A2")
        .Value = "Hace todas las posiciones de un tiron. No graba nunca. Para pararlo: mueve el raton o pulsa Pausa."
        .Font.Italic = True
        .Font.Color = RGB(110, 110, 110)
    End With

    ws.Range("B3").Value = "Pausa entre teclas (ms)"
    ws.Range(C_PAUSA).Value = 80
    ws.Range("B4").Value = "Separador decimal en SAP"
    ws.Range(C_SEP).NumberFormat = "@"
    ws.Range(C_SEP).Value = ","
    ws.Range("B5").Value = "La ventana de SAP debe contener"
    ws.Range(C_TITULO).NumberFormat = "@"
    ws.Range(C_TITULO).Value = "Sol.abono;Datos de pos"
    ws.Range("B6").Value = "Teclas del ZNET de prueba"
    ws.Range(C_SECUENCIA).NumberFormat = "@"
    ws.Range(C_SECUENCIA).Value = SECUENCIA_ZNET
    ws.Range("B7").Value = "Valor de prueba"
    ws.Range(C_PRUEBA).Value = 10
    ws.Range("B8").Value = "Espera maxima a SAP (s)"
    ws.Range(C_ESPERA).Value = 8
    ws.Range("B9").Value = "Filas de la tabla donde buscar el ZNET"
    ws.Range(C_FILAS).Value = 15
    ws.Range("C3:C9").Interior.Color = RGB(255, 242, 204)

    ws.Range("E3").Value = "Calibracion:"
    ws.Range("E3").Font.Bold = True
    ws.Range("E5").Value = "Pausa en Tab/Intro (ms)"
    ws.Range(C_PAUSA_CAMPO).Value = 200
    ws.Range(C_PAUSA_CAMPO).Interior.Color = RGB(255, 242, 204)

    ws.Range("A10").Value = "Pega en B12 lo que copia la Calculadora con 'Copiar para el asistente SAP'. Una fila vacia marca el final."
    ws.Range("A10").Font.Color = RGB(110, 110, 110)

    ws.Range(ws.Cells(FILA_CAB, 1), ws.Cells(FILA_CAB, COL_ESTADO)).Value = _
        Array("N", "Pos.", "Importe a abonar", "Descripcion", "Neto de prueba", "ZNET escrito", "Neto final", "Estado")
    With ws.Range(ws.Cells(FILA_CAB, 1), ws.Cells(FILA_CAB, COL_ESTADO))
        .Font.Bold = True
        .Font.Color = RGB(255, 255, 255)
        .Interior.Color = RGB(53, 74, 95)
    End With

    With ws.Range(ws.Cells(FILA_INI, 1), ws.Cells(FILA_INI + NUM_FILAS - 1, 1))
        .Formula = "=IF(B" & FILA_INI & "="""","""",ROW()-" & (FILA_INI - 1) & ")"
        .Font.Color = RGB(150, 150, 150)
        .HorizontalAlignment = xlCenter
    End With
    ws.Range(ws.Cells(FILA_INI, COL_OBJ), ws.Cells(FILA_INI + NUM_FILAS - 1, COL_NFINAL)).NumberFormat = "#,##0.00"
    ws.Range(ws.Cells(FILA_INI, COL_POS), ws.Cells(FILA_INI + NUM_FILAS - 1, COL_DESC)).Interior.Color = RGB(255, 242, 204)

    ws.Columns("A").ColumnWidth = 5
    ws.Columns("B").ColumnWidth = 34
    ws.Columns("C").ColumnWidth = 30
    ws.Columns("D").ColumnWidth = 34
    ws.Columns("E").ColumnWidth = 14
    ws.Columns("F").ColumnWidth = 14
    ws.Columns("G").ColumnWidth = 14
    ws.Columns("H").ColumnWidth = 44

    For i = 1 To CAL_N
        ws.Range(COL_CAL & i).Value = cal(i)
    Next i
    ws.Columns(COL_CAL).Hidden = True
    PintarCalibracion ws

    x = ws.Columns("J").Left
    CrearBoton ws, "1. Calibrar (una vez)", "Calibrar", ws.Range("A2").Top, x, RGB(110, 110, 110)
    CrearBoton ws, "2. Probar lectura", "ProbarLectura", ws.Range("A4").Top, x, RGB(10, 110, 209)
    CrearBoton ws, "3. Hacer todas las posiciones", "HacerTodas", ws.Range("A6").Top, x, RGB(16, 126, 62)
    CrearBoton ws, "Reiniciar estados", "ReiniciarEstados", ws.Range("A8").Top, x, RGB(110, 110, 110)
    CrearBoton ws, "Limpiar todo", "LimpiarTodo", ws.Range("A10").Top, x, RGB(187, 0, 0)

    ws.Range("J13").Value = "Como se usa"
    ws.Range("J13").Font.Bold = True
    ws.Range("J14").Value = "Una vez: con un abono en SAP en Condiciones, pulsa 'Calibrar' y sigue los pasos."
    ws.Range("J15").Value = "1. Calculadora: 'Copiar para el asistente SAP' y pegar en B12."
    ws.Range("J16").Value = "2. SAP: abono creado con referencia, solo con las lineas del cargo,"
    ws.Range("J17").Value = "   dentro de una posicion, pestana Condiciones."
    ws.Range("J18").Value = "3. Aqui: 'Hacer todas las posiciones'. No toques nada mientras trabaja."
    ws.Range("J19").Value = "4. Al acabar: pon el ZAJU que te diga (si hay), revisa y graba tu."
    ws.Range("J14:J19").Font.Color = RGB(80, 80, 80)

    ws.Activate
    ActiveWindow.FreezePanes = False
    ws.Range("A" & FILA_INI).Select
    ActiveWindow.FreezePanes = True
    ws.Range("B" & FILA_INI).Select
End Sub

Private Sub CrearBoton(ws As Worksheet, ByVal texto As String, ByVal nombreMacro As String, _
                       ByVal arriba As Double, ByVal izquierda As Double, ByVal color As Long)
    Dim b As Shape
    Set b = ws.Shapes.AddShape(msoShapeRoundedRectangle, izquierda, arriba, 230, 26)
    b.Fill.ForeColor.RGB = color
    b.Line.Visible = msoFalse
    With b.TextFrame2
        .VerticalAnchor = msoAnchorMiddle
        .TextRange.Text = texto
        .TextRange.Font.Size = 11
        .TextRange.Font.Bold = msoTrue
        .TextRange.Font.Fill.ForeColor.RGB = RGB(255, 255, 255)
        .TextRange.ParagraphFormat.Alignment = msoAlignCenter
    End With
    b.OnAction = nombreMacro
End Sub


' ------------------------------------------------------------------
'  1. CALIBRAR: donde estan las casillas dentro de la ventana de SAP
' ------------------------------------------------------------------
Public Sub Calibrar()
    Dim ws As Worksheet, p(1 To CAL_N) As PUNTO, i As Long, alto As Long
    Dim que As Variant, motivo As String

    On Error GoTo ErrorVBA
    Set ws = HojaAsistente(): If ws Is Nothing Then Exit Sub
    If Not Preparar(ws, False) Then Exit Sub

    If MsgBox("Antes de empezar, en SAP:" & vbCrLf & _
              "  - Ventana en su sitio y con su tamano de siempre." & vbCrLf & _
              "  - Dentro de una posicion del abono, pestana Condiciones." & vbCrLf & _
              "  - Tabla subida arriba del todo (Ctrl+Inicio), con ZTAR en la 1a fila." & vbCrLf & vbCrLf & _
              "Te ire pidiendo 7 puntos. Para cada uno:" & vbCrLf & _
              "  1) pulsa Aceptar en el aviso," & vbCrLf & _
              "  2) DESPUES pon el raton encima del sitio en SAP (sin hacer clic)," & vbCrLf & _
              "  3) y pulsa la tecla Control. Oiras un pitido.", _
              vbOKCancel + vbInformation, TITULO_MSG) <> vbOK Then Exit Sub

    que = Array("", _
        "la casilla POSICION (la del 90): su borde IZQUIERDO, por dentro", _
        "la casilla POSICION: su borde DERECHO, por dentro", _
        "la casilla NETO de arriba (la del 5,02): su borde IZQUIERDO, por dentro", _
        "la casilla NETO: su borde DERECHO, por dentro (antes de 'EUR')", _
        "la columna IMPORTE de la 1a fila de la tabla (ZTAR): borde IZQUIERDO, por dentro", _
        "la columna IMPORTE de la 1a fila: borde DERECHO, por dentro", _
        "la columna IMPORTE de la 2a fila (ZDC1): en el centro")

    For i = CAL_POS_I To CAL_IMP_2
        If Not CapturarPunto("Punto " & (i - 2) & " de 7:" & vbCrLf & vbCrLf & _
                             "Pulsa Aceptar. Luego pon el raton sobre " & que(i - 2) & _
                             " y pulsa Control.", p(i), motivo) Then
            MsgBox "Calibracion cancelada en el punto " & (i - 2) & ": " & motivo & "." & vbCrLf & _
                   "No se ha guardado nada; la calibracion anterior (si la habia) sigue valiendo.", _
                   vbExclamation, TITULO_MSG
            Exit Sub
        End If
    Next i

    ' Comprobaciones de sentido comun
    alto = p(CAL_IMP_2).y - p(CAL_IMP_I).y
    If p(CAL_POS_D).x - p(CAL_POS_I).x < 10 Or p(CAL_NETO_D).x - p(CAL_NETO_I).x < 10 Or _
       p(CAL_IMP_D).x - p(CAL_IMP_I).x < 10 Then
        MsgBox "Algun borde derecho ha quedado a la izquierda del izquierdo. Repite la calibracion.", _
               vbExclamation, TITULO_MSG
        Exit Sub
    End If
    If alto < 8 Or alto > 60 Then
        MsgBox "La 2a fila de la tabla no ha quedado justo debajo de la 1a (" & alto & " px). " & _
               "Repite la calibracion.", vbExclamation, TITULO_MSG
        Exit Sub
    End If

    ws.Range(COL_CAL & CAL_ANCHO).Value = mRect.Der - mRect.Izq
    ws.Range(COL_CAL & CAL_ALTO).Value = mRect.Aba - mRect.Arr
    For i = CAL_POS_I To CAL_IMP_2
        ws.Range(COL_CAL & i).Value = (p(i).x - mRect.Izq) & ";" & (p(i).y - mRect.Arr)
    Next i
    PintarCalibracion ws
    SoltarTeclas
    ProbarLectura
    Exit Sub
ErrorVBA:
    MsgBox "Error de VBA en 'Calibrar': " & Err.Description & " (" & Err.Number & ")." & vbCrLf & _
           "Mandale una captura de este aviso a quien te hizo el asistente.", vbCritical, TITULO_MSG
End Sub

Private Function CapturarPunto(ByVal texto As String, ByRef p As PUNTO, ByRef motivo As String) As Boolean
    Dim t As Single
    If MsgBox(texto, vbOKCancel + vbQuestion + vbSystemModal, TITULO_MSG) <> vbOK Then
        motivo = "has pulsado Cancelar"
        Exit Function
    End If
    ' Esperar a que se suelte Control (por si estaba pulsada) y luego a que se pulse.
    t = Timer
    Do While (GetAsyncKeyState(VK_CONTROL) And &H8000) <> 0
        DoEvents: Sleep 20
        If Timer - t > 10 Or Timer < t Then motivo = "la tecla Control se ha quedado pulsada": Exit Function
    Loop
    t = Timer
    Do
        DoEvents: Sleep 20
        If (GetAsyncKeyState(VK_CONTROL) And &H8000) <> 0 Then Exit Do
        If Timer - t > 120 Or Timer < t Then
            motivo = "en 2 minutos no he notado la tecla Control (hay que pulsarla DESPUES de Aceptar)"
            Exit Function
        End If
    Loop
    GetCursorPos p
    Beep
    CapturarPunto = True
End Function

Private Sub PintarCalibracion(ws As Worksheet)
    If Len(CStr(ws.Range(COL_CAL & CAL_IMP_2).Value)) = 0 Then
        ws.Range(C_CALIB).Value = "SIN CALIBRAR: pulsa 'Calibrar'"
        ws.Range(C_CALIB).Font.Color = RGB(187, 0, 0)
    Else
        ws.Range(C_CALIB).Value = "hecha, ventana de " & ws.Range(COL_CAL & CAL_ANCHO).Value & " x " & _
                                  ws.Range(COL_CAL & CAL_ALTO).Value & " px"
        ws.Range(C_CALIB).Font.Color = RGB(16, 126, 62)
    End If
End Sub


' ------------------------------------------------------------------
'  2. PROBAR LECTURA: lee Posicion, Neto y las 3 primeras filas
' ------------------------------------------------------------------
Public Sub ProbarLectura()
    Dim ws As Worksheet, txt As String, r As Long, s As String, vacias As Long, diag As String
    On Error GoTo ErrorVBA
    Set ws = HojaAsistente(): If ws Is Nothing Then Exit Sub
    If Not Preparar(ws, True) Then Exit Sub
    If Not ActivarSAP(mVentana) Then MsgBox "No he podido traer SAP al frente.", vbExclamation, TITULO_MSG: Exit Sub
    Sleep 300

    s = LeerCasilla(CAL_POS_I, CAL_POS_D, 0): If Len(s) = 0 Then vacias = vacias + 1
    txt = "Posicion: [" & s & "]" & vbCrLf
    s = LeerCasilla(CAL_NETO_I, CAL_NETO_D, 0): If Len(s) = 0 Then vacias = vacias + 1
    txt = txt & "Neto: [" & s & "]" & vbCrLf
    For r = 1 To 3
        s = LeerCasilla(CAL_IMP_I, CAL_IMP_D, r - 1): If Len(s) = 0 Then vacias = vacias + 1
        txt = txt & "Importe fila " & r & ": [" & s & "]" & vbCrLf
    Next r

    If Len(mMotivo) > 0 Then
        diag = "SE HA PARADO A MITAD porque " & mMotivo & "." & vbCrLf & _
               "No toques el raton mientras lee y vuelve a probar."
    ElseIf vacias > 0 Then
        diag = "SAP no ha copiado nada en " & vacias & " casilla(s)." & vbCrLf & _
               "Comprueba que SAP esta en Condiciones, con la tabla arriba (Ctrl+Inicio)," & vbCrLf & _
               "y que la ventana no se ha movido de pantalla. Si sigue igual, repite 'Calibrar'."
    Else
        diag = "Si coincide con la pantalla, la calibracion vale."
    End If
    ws.Activate
    MsgBox "Esto es lo que leo en SAP:" & vbCrLf & vbCrLf & txt & vbCrLf & diag & vbCrLf & vbCrLf & _
           "(Ventana: " & TituloVentana(mVentana) & ", en " & mRect.Izq & "," & mRect.Arr & ", " & _
           (mRect.Der - mRect.Izq) & " x " & (mRect.Aba - mRect.Arr) & ")", _
           IIf(Len(diag) > 60, vbExclamation, vbInformation) + vbSystemModal, TITULO_MSG
    Exit Sub
ErrorVBA:
    MsgBox "Error de VBA en 'Probar lectura': " & Err.Description & " (" & Err.Number & ")", vbCritical, TITULO_MSG
End Sub


' ------------------------------------------------------------------
'  3. HACER TODAS LAS POSICIONES
' ------------------------------------------------------------------
Public Sub HacerTodas()
    Dim ws As Worksheet, f As Long, n As Long, total As Double, fallo As String
    Dim prueba As Double, secPrueba As Collection, espera As Long, maxFilas As Long
    Dim pos As String, posAnterior As String, ultima As String, arrastre As Double
    Dim vueltas As Long, hechas As Long, saltadas As String, pendientes As String

    On Error GoTo ErrorVBA
    Set ws = HojaAsistente(): If ws Is Nothing Then Exit Sub
    If Not Preparar(ws, True) Then Exit Sub

    ' --- Comprobar la lista
    For f = FILA_INI To FILA_INI + NUM_FILAS - 1
        If CeldaVacia(ws.Cells(f, COL_POS)) Then Exit For
        If Not IsNumeric(ws.Cells(f, COL_OBJ).Value) Or CeldaVacia(ws.Cells(f, COL_OBJ)) Then
            MsgBox "La fila " & f & " (posicion " & ws.Cells(f, COL_POS).Value & ") no tiene importe a abonar.", _
                   vbExclamation, TITULO_MSG
            Exit Sub
        End If
        If CDbl(ws.Cells(f, COL_OBJ).Value) <= 0 Then
            MsgBox "La posicion " & ws.Cells(f, COL_POS).Value & " tiene un importe negativo o cero. " & _
                   "Eso no lo hace el asistente.", vbExclamation, TITULO_MSG
            Exit Sub
        End If
        If Left$(CStr(ws.Cells(f, COL_ESTADO).Value), 2) <> "OK" Then
            n = n + 1
            total = total + CDbl(ws.Cells(f, COL_OBJ).Value)
        Else
            ' Si se retoma tras una parada, lo que quedo sin cuadrar sigue contando
            arrastre = arrastre + CDbl(ws.Cells(f, COL_OBJ).Value) - Val(ws.Cells(f, COL_NFINAL).Value)
        End If
    Next f
    If n = 0 Then MsgBox "No hay posiciones pendientes. Pega la lista en B12.", vbInformation, TITULO_MSG: Exit Sub

    prueba = Val(Replace(CStr(ws.Range(C_PRUEBA).Value), ",", "."))
    If prueba <= 0 Then MsgBox "El valor de prueba (" & C_PRUEBA & ") tiene que ser mayor que cero.", vbExclamation, TITULO_MSG: Exit Sub
    Set secPrueba = New Collection
    fallo = TeclasDeSecuencia(CStr(ws.Range(C_SECUENCIA).Value), ImporteTexto(prueba), secPrueba)
    If Len(fallo) > 0 Then MsgBox fallo & vbCrLf & "Revisa la celda " & C_SECUENCIA & ".", vbExclamation, TITULO_MSG: Exit Sub
    espera = Val(ws.Range(C_ESPERA).Value) * 1000
    If espera < 2000 Then espera = 2000
    maxFilas = Val(ws.Range(C_FILAS).Value)
    If maxFilas < 5 Then maxFilas = 5

    If MsgBox(n & " posiciones, " & Format(total, "#,##0.00") & " EUR en total." & vbCrLf & vbCrLf & _
              "En SAP tienes que estar dentro de una posicion del abono, pestana Condiciones." & vbCrLf & _
              "Empiezo por la primera posicion (Mayus+F5) y voy una a una." & vbCrLf & vbCrLf & _
              "No toques el raton ni el teclado mientras trabaja." & vbCrLf & _
              "Para pararlo: mueve el raton o pulsa Pausa." & vbCrLf & _
              "No graba: al final grabas tu.", vbOKCancel + vbInformation, TITULO_MSG) <> vbOK Then Exit Sub

    If Not ActivarSAP(mVentana) Then MsgBox "No he podido traer SAP al frente.", vbExclamation, TITULO_MSG: Exit Sub
    Sleep 300
    Application.StatusBar = "Asistente SAP trabajando... mueve el raton para pararlo."
    arrastre = Round(arrastre, 2)

    ' --- Primero se mira cual es la ultima posicion (Mayus+F8), para no
    ' tener que esperar al final a ver si Mayus+F7 ya no avanza.
    pos = EsperarPosicionDistinta("", espera)
    If Len(pos) = 0 Then mMotivo = "no consigo leer el numero de posicion": GoTo Parado
    If Not Pulsar("+{F8}") Then GoTo Parado
    ultima = EsperarPosicionDistinta(pos, 2500)
    If Len(mMotivo) > 0 Then GoTo Parado
    If Len(ultima) = 0 Then ultima = pos            ' no se ha movido: ya estaba en la ultima

    ' --- A la primera posicion
    If Not Pulsar("+{F5}") Then GoTo Parado
    pos = EsperarPosicionDistinta(ultima, 2500)
    If Len(mMotivo) > 0 Then GoTo Parado
    If Len(pos) = 0 Then pos = ultima               ' el abono solo tiene una posicion

    Do
        vueltas = vueltas + 1
        If vueltas > 400 Then mMotivo = "demasiadas vueltas": GoTo Parado

        f = FilaDePosicion(ws, pos)
        If f = 0 Then
            If Len(saltadas) < 200 Then saltadas = saltadas & " " & pos
        ElseIf Left$(CStr(ws.Cells(f, COL_ESTADO).Value), 2) <> "OK" Then
            If Not HacerPosicion(ws, f, secPrueba, prueba, maxFilas, espera, arrastre) Then GoTo Parado
            hechas = hechas + 1
        End If

        ' Siguiente posicion. En la ultima se acaba sin esperar a nada.
        If Val(pos) = Val(ultima) Then Exit Do
        posAnterior = pos
        If Not Pulsar("+{F7}") Then GoTo Parado
        pos = EsperarPosicionDistinta(posAnterior, espera)
        If Len(mMotivo) > 0 Then GoTo Parado
    Loop While Len(pos) > 0

    ' --- Resumen
    Application.StatusBar = False
    For f = FILA_INI To FILA_INI + NUM_FILAS - 1
        If CeldaVacia(ws.Cells(f, COL_POS)) Then Exit For
        If Left$(CStr(ws.Cells(f, COL_ESTADO).Value), 2) <> "OK" Then
            pendientes = pendientes & " " & ws.Cells(f, COL_POS).Value
            MarcarFila ws, f, "NO ENCONTRADA en el abono", False
        End If
    Next f
    ws.Activate
    MsgBox "Hecho: " & hechas & " posiciones en esta vuelta." & vbCrLf & vbCrLf & _
           IIf(Len(pendientes) > 0, "OJO, no estaban en el abono:" & pendientes & vbCrLf & vbCrLf, "") & _
           IIf(Len(saltadas) > 0, "Posiciones del abono que no estaban en la lista (no tocadas):" & saltadas & vbCrLf & vbCrLf, "") & _
           "Lo que falta por cuadrar (ZAJU de cabecera): " & Format(arrastre, "#,##0.00") & " EUR" & vbCrLf & vbCrLf & _
           "Revisa el neto total en SAP y graba tu.", _
           IIf(Len(pendientes) > 0, vbExclamation, vbInformation) + vbSystemModal, TITULO_MSG
    Exit Sub

Parado:
    Application.StatusBar = False
    ws.Activate
    MsgBox "PARADO: " & mMotivo & vbCrLf & vbCrLf & _
           "Revisa en SAP la posicion " & pos & " antes de seguir." & vbCrLf & _
           "Las posiciones con estado OK ya estan hechas: si vuelves a pulsar " & _
           "'Hacer todas las posiciones', solo hace las que faltan." & vbCrLf & _
           "Lo arrastrado hasta aqui por los decimales: " & Format(arrastre, "#,##0.00") & " EUR.", _
           vbExclamation + vbSystemModal, TITULO_MSG
    Exit Sub
ErrorVBA:
    Application.StatusBar = False
    MsgBox "Error de VBA: " & Err.Description & " (" & Err.Number & "), en la posicion " & pos & "." & vbCrLf & _
           "Revisa esa posicion en SAP antes de seguir.", vbCritical + vbSystemModal, TITULO_MSG
End Sub

' Una posicion completa, en una sola visita. Devuelve False si hay que parar.
Private Function HacerPosicion(ws As Worksheet, ByVal f As Long, secPrueba As Collection, ByVal prueba As Double, _
                               ByVal maxFilas As Long, ByVal espera As Long, ByRef arrastre As Double) As Boolean
    Dim objetivo As Double, n0 As Double, nPrueba As Double, nFinal As Double, ok As Boolean
    Dim znet As Double, fila As Long, paso As Double, intento As Long, t As Variant, actual As Double

    objetivo = Round(CDbl(ws.Cells(f, COL_OBJ).Value) + arrastre, 2)
    ws.Cells(f, COL_NPRUEBA).ClearContents
    ws.Cells(f, COL_ZNET).ClearContents
    ws.Cells(f, COL_NFINAL).ClearContents

    ' 1. Neto antes de tocar nada
    n0 = LeerImporte(CAL_NETO_I, CAL_NETO_D, 0, ok)
    If Not ok Then mMotivo = "no consigo leer el Neto de la posicion": GoTo Mal

    ' 2. ZNET de prueba en la fila en blanco
    If Not EnfocarTabla() Then GoTo Mal
    If Not Pulsar("^{END}") Then GoTo Mal
    Sleep 300
    For Each t In secPrueba
        If Not Pulsar(CStr(t)) Then GoTo Mal
    Next t
    If Not Pulsar("{ENTER}") Then GoTo Mal

    ' 3. Neto con la prueba
    nPrueba = EsperarNetoDistinto(n0, espera, ok)
    If Not ok Then
        If Len(mMotivo) = 0 Then mMotivo = "el Neto no ha cambiado al poner el ZNET de prueba " & _
            "(ya tenia ZNET? ha salido un aviso?)"
        GoTo Mal
    End If
    If nPrueba <= 0 Then mMotivo = "el Neto con el ZNET de prueba es " & nPrueba: GoTo Mal
    ws.Cells(f, COL_NPRUEBA).Value = nPrueba

    ' 4. ZNET definitivo; si al leerlo no da, una correccion con la nueva medida
    znet = Round(objetivo * prueba / nPrueba, 2)
    nFinal = nPrueba
    actual = prueba                         ' lo que pone ahora en la casilla del ZNET
    For intento = 1 To 2
        If znet <= 0 Then mMotivo = "sale un ZNET de " & znet: GoTo Mal
        fila = BuscarFilaImporte(actual, maxFilas)
        If fila = 0 Then
            If Len(mMotivo) = 0 Then mMotivo = "no encuentro la fila del ZNET en la tabla (con " & _
                ImporteTexto(actual) & ")"
            GoTo Mal
        End If
        If Not EscribirEnFila(fila, ImporteTexto(znet)) Then GoTo Mal
        ws.Cells(f, COL_ZNET).Value = znet
        actual = znet

        nFinal = EsperarNetoDistinto(nFinal, espera, ok)
        If Not ok Then
            If Len(mMotivo) > 0 Then GoTo Mal
            nFinal = LeerImporte(CAL_NETO_I, CAL_NETO_D, 0, ok)   ' puede que no cambie
            If Not ok Then mMotivo = "no consigo leer el Neto final": GoTo Mal
        End If
        ws.Cells(f, COL_NFINAL).Value = nFinal

        paso = nPrueba / prueba * 0.01      ' lo que mueve un centimo de ZNET
        If Abs(nFinal - objetivo) <= paso / 2 + 0.015 Then Exit For
        If intento = 2 Then
            mMotivo = "el Neto final (" & Format(nFinal, "0.00") & ") no da el importe (" & _
                      Format(objetivo, "0.00") & ") ni corrigiendo"
            GoTo Mal
        End If
        znet = Round(objetivo * znet / nFinal, 2)
    Next intento

    arrastre = Round(objetivo - nFinal, 2)
    MarcarFila ws, f, "OK " & Format(Now, "hh:mm:ss") & _
               IIf(Abs(arrastre) >= 0.005, "  (pasa " & Format(arrastre, "0.00") & " a la siguiente)", ""), True
    HacerPosicion = True
    Exit Function

Mal:
    MarcarFila ws, f, "PARADO: " & mMotivo, False
End Function


' ------------------------------------------------------------------
'  UTILIDADES DE LA HOJA
' ------------------------------------------------------------------
Public Sub ReiniciarEstados()
    Dim ws As Worksheet
    Set ws = HojaAsistente(): If ws Is Nothing Then Exit Sub
    With ws.Range(ws.Cells(FILA_INI, COL_NPRUEBA), ws.Cells(FILA_INI + NUM_FILAS - 1, COL_ESTADO))
        .ClearContents
        .Interior.Pattern = xlNone
    End With
End Sub

Public Sub LimpiarTodo()
    Dim ws As Worksheet
    Set ws = HojaAsistente(): If ws Is Nothing Then Exit Sub
    If MsgBox("Se borraran las posiciones y los estados (la calibracion no). Continuar?", _
              vbOKCancel + vbExclamation, TITULO_MSG) <> vbOK Then Exit Sub
    ws.Range(ws.Cells(FILA_INI, COL_POS), ws.Cells(FILA_INI + NUM_FILAS - 1, COL_DESC)).ClearContents
    ReiniciarEstados
End Sub


' ------------------------------------------------------------------
'  SAP: ventana, teclas y raton
' ------------------------------------------------------------------

' Busca SAP, comprueba el titulo y (si hace falta) la calibracion.
Private Function Preparar(ws As Worksheet, ByVal conCalibracion As Boolean) As Boolean
    Dim titulo As String, anchoCal As Long, altoCal As Long

    mMotivo = ""
    mFilaZnet = 0
    mUltimoRaton.x = 0
    mUltimoRaton.y = 0
    mVentana = FindWindow(SAP_CLASE, vbNullString)
    If mVentana = 0 Then MsgBox "No encuentro ninguna ventana de SAP abierta.", vbExclamation, TITULO_MSG: Exit Function
    titulo = TituloVentana(mVentana)
    mRequisitos = CStr(ws.Range(C_TITULO).Value)
    If Not TituloValido(titulo, mRequisitos) Then
        MsgBox "La ventana de SAP es:" & vbCrLf & "   " & titulo & vbCrLf & vbCrLf & _
               "y tiene que contener: " & mRequisitos & vbCrLf & _
               "Entra en una posicion del abono (Datos de posicion, pestana Condiciones).", _
               vbExclamation, TITULO_MSG
        Exit Function
    End If
    GetWindowRect mVentana, mRect

    mSep = CStr(ws.Range(C_SEP).Value)
    If Len(mSep) = 0 Then mSep = ","
    mPausa = Val(ws.Range(C_PAUSA).Value)
    If mPausa < 80 Then mPausa = 80
    ' SAP pierde teclas si se cambia de casilla demasiado rapido (el
    ' desplegable del historial se come el Tab): pausa larga antes y despues.
    If Len(CStr(ws.Range(C_PAUSA_CAMPO).Value)) = 0 Then
        mPausaCampo = 200
    Else
        mPausaCampo = Val(ws.Range(C_PAUSA_CAMPO).Value)
    End If
    If mPausaCampo < 50 Then mPausaCampo = 50
    ' La hoja de la primera v3 traia una secuencia con un Tab de menos (el
    ' 10 caia en Descripcion y el 100 en Moneda): se corrige sola.
    If StrComp(Trim$(CStr(ws.Range(C_SECUENCIA).Value)), SECUENCIA_V3_MALA, vbTextCompare) = 0 Then
        ws.Range(C_SECUENCIA).Value = SECUENCIA_ZNET
    End If
    Set mShell = Nothing
    On Error Resume Next
    Set mShell = CreateObject("WScript.Shell")
    On Error GoTo 0

    If conCalibracion Then
        If Len(CStr(ws.Range(COL_CAL & CAL_IMP_2).Value)) = 0 Then
            MsgBox "Falta calibrar: pulsa 'Calibrar' con SAP en la pantalla de Condiciones.", vbExclamation, TITULO_MSG
            Exit Function
        End If
        anchoCal = Val(ws.Range(COL_CAL & CAL_ANCHO).Value)
        altoCal = Val(ws.Range(COL_CAL & CAL_ALTO).Value)
        If Abs((mRect.Der - mRect.Izq) - anchoCal) > 4 Or Abs((mRect.Aba - mRect.Arr) - altoCal) > 4 Then
            MsgBox "La ventana de SAP ha cambiado de tamano desde la calibracion" & vbCrLf & _
                   "(ahora " & (mRect.Der - mRect.Izq) & " x " & (mRect.Aba - mRect.Arr) & ", calibrada en " & _
                   anchoCal & " x " & altoCal & ")." & vbCrLf & vbCrLf & _
                   "Dejala como estaba o vuelve a calibrar.", vbExclamation, TITULO_MSG
            Exit Function
        End If
    End If
    Preparar = True
End Function

' Punto calibrado n, en coordenadas de pantalla, bajando "filas" filas de la tabla
Private Function PuntoCal(ByVal n As Long, ByVal filas As Long) As PUNTO
    Dim partes() As String, ws As Worksheet, alto As Long
    Set ws = ThisWorkbook.Worksheets(HOJA)
    partes = Split(CStr(ws.Range(COL_CAL & n).Value), ";")
    PuntoCal.x = mRect.Izq + Val(partes(0))
    PuntoCal.y = mRect.Arr + Val(partes(1))
    If filas > 0 Then
        alto = Val(Split(CStr(ws.Range(COL_CAL & CAL_IMP_2).Value), ";")(1)) - _
               Val(Split(CStr(ws.Range(COL_CAL & CAL_IMP_I).Value), ";")(1))
        PuntoCal.y = PuntoCal.y + filas * alto
    End If
End Function

' Selecciona con el raton de izquierda a derecha y copia. Devuelve el texto.
Private Function LeerCasilla(ByVal nIzq As Long, ByVal nDer As Long, ByVal filas As Long) As String
    Dim a As PUNTO, b As PUNTO, i As Long, x As Long, s As String, intento As Long
    a = PuntoCal(nIzq, filas)
    b = PuntoCal(nDer, filas)
    b.y = a.y
    SoltarTeclas
    For intento = 1 To 2
        If Not Seguir() Then Exit Function
        VaciarPortapapeles
        MoverRaton a.x, a.y
        Sleep 25
        mouse_event RATON_ABAJO, 0, 0, 0, 0
        For i = 1 To 3
            x = a.x + (b.x - a.x) * i \ 3
            MoverRaton x, a.y
            Sleep 10
        Next i
        mouse_event RATON_ARRIBA, 0, 0, 0, 0
        Sleep 40
        If Not Pulsar("^c") Then Exit Function
        For i = 1 To 12
            Sleep 25
            s = LeerPortapapeles()
            If Len(s) > 0 Then Exit For
        Next i
        s = Trim$(Replace(Replace(Replace(s, vbCr, ""), vbLf, ""), vbTab, " "))
        If Len(s) > 0 Then Exit For
    Next intento
    LeerCasilla = s
End Function

Private Function LeerImporte(ByVal nIzq As Long, ByVal nDer As Long, ByVal filas As Long, ByRef ok As Boolean) As Double
    LeerImporte = NumeroSAP(LeerCasilla(nIzq, nDer, filas), ok)
End Function

' Espera a que el Neto de arriba cambie (SAP ha recalculado) y lo devuelve.
Private Function EsperarNetoDistinto(ByVal antes As Double, ByVal espera As Long, ByRef ok As Boolean) As Double
    Dim t As Single, v As Double, leido As Boolean
    t = Timer
    ok = False
    Do
        If Not SapListo() Then Exit Function
        v = LeerImporte(CAL_NETO_I, CAL_NETO_D, 0, leido)
        If Len(mMotivo) > 0 Then Exit Function
        ' SAP repinta la pantalla entera de una vez: el primer valor
        ' distinto ya es el recalculado.
        If leido And Abs(v - antes) > 0.001 Then ok = True: EsperarNetoDistinto = v: Exit Function
        Sleep 100
    Loop While (Timer - t) * 1000 < espera And Timer >= t
End Function

' Lee la posicion hasta que sea un numero distinto de "antes". "" si no cambia.
Private Function EsperarPosicionDistinta(ByVal antes As String, ByVal espera As Long) As String
    Dim t As Single, s As String
    t = Timer
    Do
        If Not SapListo() Then Exit Function
        s = LeerCasilla(CAL_POS_I, CAL_POS_D, 0)
        If Len(mMotivo) > 0 Then Exit Function
        If Len(s) > 0 And IsNumeric(s) And s <> antes Then EsperarPosicionDistinta = s: Exit Function
        Sleep 100
    Loop While (Timer - t) * 1000 < espera And Timer >= t
End Function

' Sube la tabla y busca, fila a fila, la casilla Importe que dice exactamente el valor.
Private Function BuscarFilaImporte(ByVal valor As Double, ByVal maxFilas As Long) As Long
    Dim r As Long, buscado As String
    buscado = ImporteTexto(valor)
    If Not EnfocarTabla() Then Exit Function
    If Not Pulsar("^{HOME}") Then Exit Function
    ' Primero la fila donde estaba el ZNET en la posicion anterior: dentro de
    ' un mismo abono suele ser la misma, y asi no hay que leer fila a fila.
    If mFilaZnet > 0 And mFilaZnet <= maxFilas Then
        If FilaDice(mFilaZnet, buscado) Then BuscarFilaImporte = mFilaZnet: Exit Function
        If Len(mMotivo) > 0 Then Exit Function
    End If
    For r = 1 To maxFilas
        If r <> mFilaZnet Then
            If FilaDice(r, buscado) Then mFilaZnet = r: BuscarFilaImporte = r: Exit Function
            If Len(mMotivo) > 0 Then Exit Function
        End If
    Next r
End Function

Private Function FilaDice(ByVal r As Long, ByVal buscado As String) As Boolean
    FilaDice = (Replace(LeerCasilla(CAL_IMP_I, CAL_IMP_D, r - 1), " ", "") = buscado)
End Function

' Clic en la casilla Importe de esa fila, selecciona lo que hay y escribe encima.
Private Function EscribirEnFila(ByVal fila As Long, ByVal valor As String) As Boolean
    Dim a As PUNTO, b As PUNTO, i As Long
    a = PuntoCal(CAL_IMP_I, fila - 1)
    b = PuntoCal(CAL_IMP_D, fila - 1)
    If Not Clic((a.x + b.x) \ 2, a.y) Then Exit Function
    Sleep 150
    If Not Pulsar("{END}") Then Exit Function
    If Not Pulsar("+{HOME}") Then Exit Function
    For i = 1 To Len(valor)
        If Not Pulsar(Mid$(valor, i, 1)) Then Exit Function
    Next i
    EscribirEnFila = Pulsar("{ENTER}")
End Function

' Clic en la 1a fila de la tabla para que el cursor este en ella (no escribe nada).
Private Function EnfocarTabla() As Boolean
    Dim a As PUNTO, b As PUNTO
    a = PuntoCal(CAL_IMP_I, 0)
    b = PuntoCal(CAL_IMP_D, 0)
    EnfocarTabla = Clic((a.x + b.x) \ 2, a.y)
    Sleep 150
End Function

Private Function Clic(ByVal x As Long, ByVal y As Long) As Boolean
    If Not Seguir() Then Exit Function
    MoverRaton x, y
    Sleep 40
    mouse_event RATON_ABAJO, 0, 0, 0, 0
    Sleep 30
    mouse_event RATON_ARRIBA, 0, 0, 0, 0
    Clic = True
End Function

' Espera (hasta 3 s) a que no haya Control, Mayus ni Alt pulsadas con la mano:
' arrastrar con Control pulsada no selecciona igual en SAP.
Private Sub SoltarTeclas()
    Dim t As Single
    t = Timer
    Do While (GetAsyncKeyState(VK_CONTROL) And &H8000) <> 0 Or (GetAsyncKeyState(&H10) And &H8000) <> 0 _
          Or (GetAsyncKeyState(&H12) And &H8000) <> 0
        DoEvents: Sleep 30
        If Timer - t > 3 Or Timer < t Then Exit Do
    Loop
    Sleep 20
End Sub

Private Sub MoverRaton(ByVal x As Long, ByVal y As Long)
    SetCursorPos x, y
    mUltimoRaton.x = x
    mUltimoRaton.y = y
End Sub

' Una tecla, solo si SAP sigue delante con la ventana correcta.
Private Function Pulsar(ByVal tecla As String) As Boolean
    Dim cambiaCampo As Boolean
    cambiaCampo = (tecla = "{TAB}" Or tecla = "{ENTER}" Or tecla = "^{END}" Or tecla = "^{HOME}")
    If cambiaCampo Then Sleep mPausaCampo
    If Not Seguir() Then Exit Function
    If mShell Is Nothing Then
        SendKeys tecla, True
    Else
        mShell.SendKeys tecla      ' WScript.Shell: no apaga el Bloq Num
    End If
    Sleep IIf(cambiaCampo, mPausaCampo, mPausa)
    Pulsar = True
End Function

' Se puede seguir: nadie ha movido el raton, ni Pausa, y SAP esta delante.
Private Function Seguir() As Boolean
    Dim p As PUNTO
    If Len(mMotivo) > 0 Then Exit Function
    If (GetAsyncKeyState(VK_PAUSA) And &H8000) <> 0 Then mMotivo = "has pulsado Pausa": Exit Function
    If mUltimoRaton.x <> 0 Or mUltimoRaton.y <> 0 Then
        GetCursorPos p
        If Abs(p.x - mUltimoRaton.x) > 40 Or Abs(p.y - mUltimoRaton.y) > 40 Then
            mMotivo = "has movido el raton"
            Exit Function
        End If
    End If
    Seguir = SapListo()
End Function

' SAP delante y con el titulo de Datos de posicion (si sale un aviso, el
' aviso es otra ventana y esto da False).
Private Function SapListo() As Boolean
    Dim h As LongPtr, t As Single
    t = Timer
    Do
        h = GetForegroundWindow()
        If h = mVentana Then
            If TituloValido(TituloVentana(h), mRequisitos) Then SapListo = True: Exit Function
        End If
        Sleep 100
        DoEvents
    Loop While Timer - t < 1.5 And Timer >= t
    If Len(mMotivo) = 0 Then
        If h <> mVentana Then
            mMotivo = "SAP ha dejado de ser la ventana activa (ha salido un aviso?): '" & TituloVentana(h) & "'"
        Else
            mMotivo = "la ventana de SAP ya no es la de Datos de posicion: '" & TituloVentana(h) & "'"
        End If
    End If
End Function


' ------------------------------------------------------------------
'  Portapapeles (API: mas fiable que el DataObject de Office)
' ------------------------------------------------------------------
Private Sub VaciarPortapapeles()
    Dim i As Long
    For i = 1 To 10
        If OpenClipboard(0) <> 0 Then
            EmptyClipboard
            CloseClipboard
            Exit Sub
        End If
        Sleep 20
    Next i
End Sub

Private Function LeerPortapapeles() As String
    Dim h As LongPtr, p As LongPtr, n As Long, s As String, i As Long
    For i = 1 To 10
        If OpenClipboard(0) <> 0 Then Exit For
        Sleep 20
    Next i
    If i > 10 Then Exit Function
    h = GetClipboardData(CF_UNICODETEXT)
    If h <> 0 Then
        p = GlobalLock(h)
        If p <> 0 Then
            n = lstrlenW(p)
            If n > 0 And n < 4000 Then
                s = String$(n, vbNullChar)
                CopyMemory StrPtr(s), p, n * 2
            End If
            GlobalUnlock h
        End If
    End If
    CloseClipboard
    LeerPortapapeles = s
End Function


' ------------------------------------------------------------------
'  Numeros
' ------------------------------------------------------------------

' "1.234,56" / "5,02" / "47,780-" / "5,02 EUR" -> numero. ok=False si no lo es.
Private Function NumeroSAP(ByVal s As String, ByRef ok As Boolean) As Double
    Dim negativo As Boolean, i As Long, c As String, limpio As String
    ok = False
    s = Trim$(Replace(UCase$(s), "EUR", ""))
    s = Replace(s, " ", "")
    If Len(s) = 0 Then Exit Function
    If Right$(s, 1) = "-" Then negativo = True: s = Left$(s, Len(s) - 1)
    If Left$(s, 1) = "-" Then negativo = True: s = Mid$(s, 2)
    If mSep = "," Then
        s = Replace(s, ".", "")
        s = Replace(s, ",", ".")
    Else
        s = Replace(s, ",", "")
    End If
    For i = 1 To Len(s)
        c = Mid$(s, i, 1)
        If Not (c Like "[0-9.]") Then Exit Function
    Next i
    If Len(s) - Len(Replace(s, ".", "")) > 1 Then Exit Function
    NumeroSAP = Val(s)
    If negativo Then NumeroSAP = -NumeroSAP
    ok = True
End Function

' Importe para escribir en SAP: 2 decimales, separador de SAP, sin miles.
Private Function ImporteTexto(ByVal d As Double) As String
    Dim s As String
    s = Replace(Format(Round(d, 2), "0.00"), Mid$(Format(1.5, "0.0"), 2, 1), "|")
    If Len(mSep) = 0 Then mSep = ","
    ImporteTexto = Replace(s, "|", mSep)
End Function

' Traduce la secuencia de la celda C6. Solo letras, cifras, coma, punto,
' {TAB} y {PRUEBA}; nada de Intro ni combinaciones.
Private Function TeclasDeSecuencia(ByVal sec As String, ByVal valorPrueba As String, teclas As Collection) As String
    Dim i As Long, c As String
    sec = Replace(Trim$(sec), "{PRUEBA}", valorPrueba, , , vbTextCompare)
    If Len(sec) = 0 Then TeclasDeSecuencia = "La secuencia del ZNET de prueba esta vacia.": Exit Function
    i = 1
    Do While i <= Len(sec)
        If UCase$(Mid$(sec, i, 5)) = "{TAB}" Then
            teclas.Add "{TAB}"
            i = i + 5
        Else
            c = Mid$(sec, i, 1)
            If Not (c Like "[A-Za-z0-9,.]") Then
                TeclasDeSecuencia = "La secuencia solo puede llevar letras, cifras, coma, punto, {TAB} y {PRUEBA} " & _
                                    "(encontrado '" & c & "')."
                Exit Function
            End If
            teclas.Add c
            i = i + 1
        End If
    Loop
End Function


' ------------------------------------------------------------------
'  Varios
' ------------------------------------------------------------------
Private Function FilaDePosicion(ws As Worksheet, ByVal pos As String) As Long
    Dim f As Long
    For f = FILA_INI To FILA_INI + NUM_FILAS - 1
        If CeldaVacia(ws.Cells(f, COL_POS)) Then Exit Function
        If Val(ws.Cells(f, COL_POS).Value) = Val(pos) Then FilaDePosicion = f: Exit Function
    Next f
End Function

Private Function TituloValido(ByVal titulo As String, ByVal requisitos As String) As Boolean
    Dim partes() As String, i As Long
    TituloValido = True
    If Len(Trim$(requisitos)) = 0 Then Exit Function
    partes = Split(requisitos, ";")
    For i = LBound(partes) To UBound(partes)
        If Len(Trim$(partes(i))) > 0 Then
            If InStr(1, titulo, Trim$(partes(i)), vbTextCompare) = 0 Then TituloValido = False: Exit Function
        End If
    Next i
End Function

Private Sub MarcarFila(ws As Worksheet, ByVal f As Long, ByVal estado As String, ByVal bien As Boolean)
    With ws.Cells(f, COL_ESTADO)
        .Value = estado
        If bien Then
            .Interior.Color = RGB(198, 239, 206)
        Else
            .Interior.Color = RGB(255, 199, 206)
        End If
    End With
End Sub

Private Function CeldaVacia(c As Range) As Boolean
    If IsError(c.Value) Then Exit Function
    CeldaVacia = (Len(Trim$(CStr(c.Value))) = 0)
End Function

Private Function HojaAsistente() As Worksheet
    On Error Resume Next
    Set HojaAsistente = ThisWorkbook.Worksheets(HOJA)
    On Error GoTo 0
    If HojaAsistente Is Nothing Then
        MsgBox "No encuentro la hoja '" & HOJA & "'. Ejecuta primero la macro PrepararHoja (Alt+F8).", _
               vbExclamation, TITULO_MSG
    End If
End Function

Private Function TituloVentana(ByVal h As LongPtr) As String
    Dim buf As String, n As Long
    buf = String$(512, vbNullChar)
    n = GetWindowText(h, buf, 512)
    If n > 0 Then TituloVentana = Left$(buf, n)
End Function

Private Function ActivarSAP(ByVal h As LongPtr) As Boolean
    Dim i As Long
    If IsIconic(h) <> 0 Then ShowWindow h, 9
    SetForegroundWindow h
    For i = 1 To 10
        Sleep 50
        DoEvents
        If GetForegroundWindow() = h Then ActivarSAP = True: Exit Function
    Next i
    On Error Resume Next
    AppActivate TituloVentana(h)
    On Error GoTo 0
    Sleep 200
    ActivarSAP = (GetForegroundWindow() = h)
End Function
