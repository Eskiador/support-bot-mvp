Attribute VB_Name = "AsistenteSAP"
Option Explicit

' ==================================================================
'  ASISTENTE SAP PARA EL ZNET DE LOS ABONOS  (version 2)
'  VA01 > ZG2 Sol.abono GAC > Datos de posicion > Condiciones
'
'  1a pasada: en cada posicion escribe el ZNET de prueba (ZNET, 10
'             por 100) en la linea en blanco de abajo del todo.
'  2a pasada: en cada posicion sustituye ese 10 por el ZNET
'             definitivo que calcula la Calculadora de Cargos.
'
'  Lo que NO hace nunca:
'   - Pulsar Intro, Grabar ni la flecha de siguiente posicion. Eso
'     lo haces tu: es lo que aplica el valor y lo que decide.
'   - Escribir si la ventana activa no es la de Datos de posicion
'     del Sol.abono.
'   - Seguir escribiendo si SAP pierde el foco a mitad (un popup, un
'     clic en otra ventana): se para en esa misma tecla y te avisa.
'
'  Cambios respecto a la version anterior:
'   - Flujo de dos pasadas por posicion, en vez de una lista de
'     valores bajando por una columna (no servia: el ZNET se mete
'     dentro de cada posicion, no en una tabla).
'   - Comprueba el titulo de la ventana de SAP antes de escribir.
'   - Comprueba el foco antes de CADA tecla, no solo antes de cada
'     valor: un popup a mitad ya no se lleva el resto del valor.
'   - Antes de escribir el ZNET definitivo, borra lo que haya en el
'     campo (el 10 de la prueba). Antes se anadia detras.
'   - El importe sale siempre con 2 decimales y sin separador de
'     miles; si trae mas de 2 decimales no se redondea a escondidas:
'     se marca como error.
'   - Pide confirmar la posicion antes de escribir (se puede quitar
'     en la celda C7 cuando ya te fies).
' ==================================================================

Private Declare PtrSafe Function FindWindow Lib "user32" Alias "FindWindowA" (ByVal lpClassName As String, ByVal lpWindowName As String) As LongPtr
Private Declare PtrSafe Function SetForegroundWindow Lib "user32" (ByVal hWnd As LongPtr) As Long
Private Declare PtrSafe Function GetForegroundWindow Lib "user32" () As LongPtr
Private Declare PtrSafe Function GetWindowText Lib "user32" Alias "GetWindowTextA" (ByVal hWnd As LongPtr, ByVal lpString As String, ByVal cch As Long) As Long
Private Declare PtrSafe Function IsIconic Lib "user32" (ByVal hWnd As LongPtr) As Long
Private Declare PtrSafe Function ShowWindow Lib "user32" (ByVal hWnd As LongPtr, ByVal nCmdShow As Long) As Long
Private Declare PtrSafe Sub Sleep Lib "kernel32" (ByVal dwMilliseconds As Long)

Private Const HOJA As String = "Asistente SAP"
Private Const TITULO_MSG As String = "Asistente SAP"
Private Const SAP_CLASE As String = "SAP_FRONTEND_SESSION"

' Ajustes (columna C, filas 3 a 8)
Private Const C_PAUSA As String = "C3"
Private Const C_SEP As String = "C4"
Private Const C_TITULO As String = "C5"
Private Const C_SECUENCIA As String = "C6"
Private Const C_CONFIRMAR As String = "C7"
Private Const C_VENTANA As String = "C8"

' Tabla de posiciones
Private Const FILA_CAB As Long = 10
Private Const FILA_INI As Long = 11
Private Const NUM_FILAS As Long = 200
Private Const COL_POS As Long = 2      ' B  Pos.
Private Const COL_ZNET As Long = 3     ' C  ZNET definitivo
Private Const COL_DESC As Long = 4     ' D  Descripcion
Private Const COL_P1 As Long = 5       ' E  1a pasada (ZNET de prueba)
Private Const COL_P2 As Long = 6       ' F  2a pasada (ZNET definitivo)

' ------------------------------------------------------------------
'  PREPARAR LA HOJA (una sola vez, con Alt+F8)
' ------------------------------------------------------------------
Public Sub PrepararHoja()
    Dim ws As Worksheet, i As Long, x As Double

    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(HOJA)
    On Error GoTo 0
    If ws Is Nothing Then
        Set ws = ThisWorkbook.Worksheets.Add(Before:=ThisWorkbook.Worksheets(1))
        ws.Name = HOJA
    ElseIf MsgBox("La hoja '" & HOJA & "' ya existe y se va a rehacer desde cero." & vbCrLf & _
                  "Se pierde lo que tenga. Continuar?", vbOKCancel + vbExclamation, TITULO_MSG) <> vbOK Then
        Exit Sub
    End If

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
        .Value = "Nunca pulsa Intro, Grabar ni la flecha de siguiente posicion. Se para si SAP pierde el foco."
        .Font.Italic = True
        .Font.Color = RGB(110, 110, 110)
    End With

    ws.Range("B3").Value = "Pausa entre teclas (ms)"
    ws.Range(C_PAUSA).Value = 40
    ws.Range("B4").Value = "Separador decimal en SAP"
    ws.Range(C_SEP).NumberFormat = "@"
    ws.Range(C_SEP).Value = ","
    ws.Range("B5").Value = "La ventana de SAP debe contener"
    ws.Range(C_TITULO).NumberFormat = "@"
    ws.Range(C_TITULO).Value = "Sol.abono;Datos de pos"
    ws.Range("B6").Value = "Teclas de la 1a pasada"
    ws.Range(C_SECUENCIA).NumberFormat = "@"
    ws.Range(C_SECUENCIA).Value = "ZNET{TAB}10{TAB}{TAB}100"
    ws.Range("B7").Value = "Confirmar la posicion antes de escribir"
    ws.Range(C_CONFIRMAR).Value = "SI"
    ws.Range("B8").Value = "Ultima ventana SAP usada"
    ws.Range(C_VENTANA).Font.Color = RGB(110, 110, 110)
    ws.Range("C3:C7").Interior.Color = RGB(255, 242, 204)

    ' Opciones SI/NO en celdas ocultas (evita lios con el separador de listas)
    ws.Range("Z1:Z2").Value = Application.WorksheetFunction.Transpose(Array("SI", "NO"))
    ws.Columns("Z").Hidden = True
    With ws.Range(C_CONFIRMAR).Validation
        .Delete
        .Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Formula1:="=$Z$1:$Z$2"
    End With

    ws.Range("A9").Value = "Pega en B11 lo que copia la Calculadora con 'Copiar para el asistente SAP'. Una fila vacia marca el final."
    ws.Range("A9").Font.Color = RGB(110, 110, 110)

    ws.Range(ws.Cells(FILA_CAB, 1), ws.Cells(FILA_CAB, COL_P2)).Value = _
        Array("N", "Pos.", "ZNET definitivo", "Descripcion", "1a pasada (ZNET de prueba)", "2a pasada (ZNET definitivo)")
    With ws.Range(ws.Cells(FILA_CAB, 1), ws.Cells(FILA_CAB, COL_P2))
        .Font.Bold = True
        .Font.Color = RGB(255, 255, 255)
        .Interior.Color = RGB(53, 74, 95)
    End With

    With ws.Range(ws.Cells(FILA_INI, 1), ws.Cells(FILA_INI + NUM_FILAS - 1, 1))
        .Formula = "=IF(B" & FILA_INI & "="""","""",ROW()-" & (FILA_INI - 1) & ")"
        .Font.Color = RGB(150, 150, 150)
        .HorizontalAlignment = xlCenter
    End With
    ws.Range(ws.Cells(FILA_INI, COL_ZNET), ws.Cells(FILA_INI + NUM_FILAS - 1, COL_ZNET)).NumberFormat = "0.00"
    ws.Range(ws.Cells(FILA_INI, COL_POS), ws.Cells(FILA_INI + NUM_FILAS - 1, COL_DESC)).Interior.Color = RGB(255, 242, 204)

    ws.Columns("A").ColumnWidth = 5
    ws.Columns("B").ColumnWidth = 30
    ws.Columns("C").ColumnWidth = 28
    ws.Columns("D").ColumnWidth = 34
    ws.Columns("E").ColumnWidth = 30
    ws.Columns("F").ColumnWidth = 30

    x = ws.Columns("H").Left
    CrearBoton ws, "1a pasada: ZNET de prueba", "PasadaPrueba", ws.Range("H2").Top, x, RGB(10, 110, 209)
    CrearBoton ws, "2a pasada: ZNET definitivo", "PasadaDefinitiva", ws.Range("H4").Top, x, RGB(16, 126, 62)
    CrearBoton ws, "Reiniciar estados", "ReiniciarEstados", ws.Range("H6").Top, x, RGB(110, 110, 110)
    CrearBoton ws, "Limpiar todo", "LimpiarTodo", ws.Range("H8").Top, x, RGB(187, 0, 0)

    ws.Range("H11").Value = "Como se usa"
    ws.Range("H11").Font.Bold = True
    ws.Range("H12").Value = "1. Calculadora: 'Copiar para el asistente SAP' y pegar en B11."
    ws.Range("H13").Value = "2. SAP: entra en la posicion, Condiciones, clic en Tp. de la linea en blanco."
    ws.Range("H14").Value = "   Aqui: '1a pasada'. En SAP: Intro y flecha a la siguiente posicion. Repite."
    ws.Range("H15").Value = "3. Copia el Resumen de SAP y pegalo en la Calculadora (netos de prueba)."
    ws.Range("H16").Value = "4. Calculadora: 'Copiar para el asistente SAP' otra vez y pegar en B11."
    ws.Range("H17").Value = "5. SAP: en cada posicion, clic en el Importe de la linea ZNET."
    ws.Range("H18").Value = "   Aqui: '2a pasada'. En SAP: Intro y flecha a la siguiente posicion."
    ws.Range("H19").Value = "6. Revisa el valor neto total en SAP y graba tu."
    ws.Range("H12:H19").Font.Color = RGB(80, 80, 80)

    ws.Activate
    ActiveWindow.FreezePanes = False
    ws.Range("A" & FILA_INI).Select
    ActiveWindow.FreezePanes = True
    ws.Range("B" & FILA_INI).Select
End Sub

Private Sub CrearBoton(ws As Worksheet, ByVal texto As String, ByVal nombreMacro As String, _
                       ByVal arriba As Double, ByVal izquierda As Double, ByVal color As Long)
    Dim b As Shape
    Set b = ws.Shapes.AddShape(msoShapeRoundedRectangle, izquierda, arriba, 210, 28)
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
'  1a PASADA: ZNET de prueba en la siguiente posicion pendiente
'  Cursor en SAP: columna Tp. de la linea en blanco de abajo del todo
' ------------------------------------------------------------------
Public Sub PasadaPrueba()
    Dim ws As Worksheet, f As Long, teclas As Collection, fallo As String

    Set ws = HojaAsistente(): If ws Is Nothing Then Exit Sub
    f = SiguienteFila(ws, COL_P1)
    If f = 0 Then MsgBox "No quedan posiciones pendientes en la 1a pasada.", vbInformation, TITULO_MSG: Exit Sub

    Set teclas = New Collection
    fallo = TeclasDeSecuencia(CStr(ws.Range(C_SECUENCIA).Value), teclas)
    If Len(fallo) > 0 Then
        MsgBox fallo & vbCrLf & "Revisa la celda " & C_SECUENCIA & ". No se ha escrito nada.", vbExclamation, TITULO_MSG
        Exit Sub
    End If

    If Not Confirmar(ws, f, "el ZNET de prueba (" & ws.Range(C_SECUENCIA).Value & ")", _
                     "la columna Tp. de la linea en blanco de abajo del todo") Then Exit Sub
    EscribirEnSAP ws, f, COL_P1, teclas
End Sub

' ------------------------------------------------------------------
'  2a PASADA: ZNET definitivo en la siguiente posicion pendiente
'  Cursor en SAP: campo Importe de la linea ZNET (donde esta el 10)
' ------------------------------------------------------------------
Public Sub PasadaDefinitiva()
    Dim ws As Worksheet, f As Long, teclas As Collection, valor As String, fallo As String, i As Long

    Set ws = HojaAsistente(): If ws Is Nothing Then Exit Sub
    f = SiguienteFila(ws, COL_P2)
    If f = 0 Then MsgBox "No quedan posiciones pendientes en la 2a pasada.", vbInformation, TITULO_MSG: Exit Sub

    valor = ImporteSAP(ws.Cells(f, COL_ZNET).Value, CStr(ws.Range(C_SEP).Value), fallo)
    If Len(fallo) > 0 Then
        MarcarFila ws, f, COL_P2, "No escrito: " & fallo, False
        MsgBox "Posicion " & ws.Cells(f, COL_POS).Value & ": " & fallo & vbCrLf & "No se ha escrito nada.", _
               vbExclamation, TITULO_MSG
        Exit Sub
    End If

    ' Fin, Mayus+Inicio: selecciona lo que haya en el campo (el 10 de la
    ' prueba) para que el valor nuevo lo sustituya en vez de ir detras.
    Set teclas = New Collection
    teclas.Add "{END}"
    teclas.Add "+{HOME}"
    For i = 1 To Len(valor)
        teclas.Add Mid$(valor, i, 1)
    Next i

    If Not Confirmar(ws, f, "ZNET " & valor, "el campo Importe de la linea ZNET") Then Exit Sub
    EscribirEnSAP ws, f, COL_P2, teclas
End Sub

' ------------------------------------------------------------------
'  UTILIDADES DE LA HOJA
' ------------------------------------------------------------------
Public Sub ReiniciarEstados()
    Dim ws As Worksheet
    Set ws = HojaAsistente(): If ws Is Nothing Then Exit Sub
    With ws.Range(ws.Cells(FILA_INI, COL_P1), ws.Cells(FILA_INI + NUM_FILAS - 1, COL_P2))
        .ClearContents
        .Interior.Pattern = xlNone
    End With
End Sub

Public Sub LimpiarTodo()
    Dim ws As Worksheet
    Set ws = HojaAsistente(): If ws Is Nothing Then Exit Sub
    If MsgBox("Se borraran las posiciones, los ZNET y los estados. Continuar?", _
              vbOKCancel + vbExclamation, TITULO_MSG) <> vbOK Then Exit Sub
    ws.Range(ws.Cells(FILA_INI, COL_POS), ws.Cells(FILA_INI + NUM_FILAS - 1, COL_DESC)).ClearContents
    ReiniciarEstados
End Sub

' ------------------------------------------------------------------
'  FUNCIONES INTERNAS
' ------------------------------------------------------------------
Private Sub EscribirEnSAP(ws As Worksheet, ByVal f As Long, ByVal col As Long, teclas As Collection)
    Dim h As LongPtr, titulo As String, sh As Object, pausa As Long, t As Variant, n As Long

    h = VentanaSAP()
    If h = 0 Then
        MsgBox "No encuentro ninguna ventana de SAP abierta. No se ha escrito nada.", vbExclamation, TITULO_MSG
        Exit Sub
    End If
    titulo = TituloVentana(h)
    ws.Range(C_VENTANA).Value = titulo

    If Not TituloValido(titulo, CStr(ws.Range(C_TITULO).Value)) Then
        MsgBox "La ventana de SAP es:" & vbCrLf & "   " & titulo & vbCrLf & vbCrLf & _
               "y tiene que contener: " & ws.Range(C_TITULO).Value & vbCrLf & _
               "Entra en la pantalla de Datos de posicion del abono. No se ha escrito nada.", _
               vbExclamation + vbSystemModal, TITULO_MSG
        Exit Sub
    End If

    If Not ActivarSAP(h) Then
        MsgBox "No he podido traer SAP al frente. No se ha escrito nada.", vbExclamation + vbSystemModal, TITULO_MSG
        Exit Sub
    End If
    Sleep 200

    pausa = Val(ws.Range(C_PAUSA).Value)
    If pausa < 20 Then pausa = 20
    Set sh = CrearShell()

    For Each t In teclas
        ' Antes de CADA tecla: si SAP ya no es la ventana activa (popup,
        ' clic en otra ventana), se para aqui mismo.
        If GetForegroundWindow() <> h Then
            If n = 0 Then
                MarcarFila ws, f, col, "No escrito: SAP no estaba activa", False
            Else
                MarcarFila ws, f, col, "A MEDIAS (" & n & " teclas): revisa ese campo en SAP", False
            End If
            MsgBox "Parado: SAP ha dejado de ser la ventana activa." & vbCrLf & _
                   IIf(n > 0, "Ha escrito " & n & " teclas: revisa el campo en SAP antes de seguir.", _
                   "No se ha escrito nada."), vbExclamation + vbSystemModal, TITULO_MSG
            Exit Sub
        End If
        Teclear CStr(t), sh
        n = n + 1
        Sleep pausa
    Next t

    Sleep 150
    If GetForegroundWindow() <> h Then
        MarcarFila ws, f, col, "Revisar: SAP perdio el foco justo al acabar", False
        MsgBox "Escrito, pero SAP perdio el foco justo al acabar: revisa el campo.", _
               vbExclamation + vbSystemModal, TITULO_MSG
        Exit Sub
    End If
    MarcarFila ws, f, col, "Escrito " & Format(Now, "hh:mm:ss"), True
End Sub

Private Function Confirmar(ws As Worksheet, ByVal f As Long, ByVal que As String, ByVal dondeCursor As String) As Boolean
    If UCase$(Left$(Trim$(CStr(ws.Range(C_CONFIRMAR).Value)), 1)) = "N" Then Confirmar = True: Exit Function
    Confirmar = (MsgBox("Posicion " & ws.Cells(f, COL_POS).Value & "  -  " & ws.Cells(f, COL_DESC).Value & vbCrLf & vbCrLf & _
                        "Se va a escribir: " & que & vbCrLf & vbCrLf & _
                        "Comprueba que en SAP estas en la posicion " & ws.Cells(f, COL_POS).Value & _
                        " y con el cursor en " & dondeCursor & ".", _
                        vbOKCancel + vbQuestion + vbSystemModal, TITULO_MSG) = vbOK)
End Function

' Traduce la secuencia de la celda C6 a teclas sueltas. Solo admite
' letras, cifras, coma, punto y {TAB}: nada de Intro (~, {ENTER}) ni
' combinaciones (+ ^ %), que podrian validar o navegar por su cuenta.
Private Function TeclasDeSecuencia(ByVal sec As String, teclas As Collection) As String
    Dim i As Long, c As String
    sec = Trim$(sec)
    If Len(sec) = 0 Then TeclasDeSecuencia = "La secuencia de la 1a pasada esta vacia.": Exit Function
    i = 1
    Do While i <= Len(sec)
        If UCase$(Mid$(sec, i, 5)) = "{TAB}" Then
            teclas.Add "{TAB}"
            i = i + 5
        Else
            c = Mid$(sec, i, 1)
            If Not (c Like "[A-Za-z0-9,.]") Then
                TeclasDeSecuencia = "La secuencia solo puede llevar letras, cifras, coma, punto y {TAB} " & _
                                    "(encontrado '" & c & "')."
                Exit Function
            End If
            teclas.Add c
            i = i + 1
        End If
    Loop
End Function

' Importe para SAP: 2 decimales, separador de SAP, sin miles. Si trae mas
' de 2 decimales es que algo no cuadra: se avisa en vez de redondear.
Private Function ImporteSAP(ByVal v As Variant, ByVal sepSAP As String, ByRef fallo As String) As String
    Dim d As Double, s As String, c As String, sepFmt As String, i As Long, comas As Long

    If IsError(v) Then fallo = "la celda del ZNET tiene un error": Exit Function
    If IsEmpty(v) Then fallo = "falta el ZNET definitivo (haz la 1a pasada y vuelve a copiar de la Calculadora)": Exit Function

    If VarType(v) = vbString Then
        s = Replace(Trim$(v), ".", ",")
        If Len(s) = 0 Then fallo = "falta el ZNET definitivo (haz la 1a pasada y vuelve a copiar de la Calculadora)": Exit Function
        For i = 1 To Len(s)
            c = Mid$(s, i, 1)
            If c = "," Then
                comas = comas + 1
            ElseIf Not (c Like "[0-9]") Then
                fallo = "el ZNET no es un numero (" & v & ")"
                Exit Function
            End If
        Next i
        If comas > 1 Then fallo = "el ZNET no es un numero (" & v & ")": Exit Function
        d = Val(Replace(s, ",", "."))
    ElseIf IsNumeric(v) Then
        d = CDbl(v)
    Else
        fallo = "el ZNET no es un numero": Exit Function
    End If

    If d <= 0 Then fallo = "el ZNET tiene que ser mayor que cero": Exit Function
    If Abs(d * 100 - Round(d * 100)) > 0.000001 Then
        fallo = "el ZNET tiene mas de 2 decimales y SAP solo admite 2": Exit Function
    End If

    sepFmt = Mid$(Format(1.5, "0.0"), 2, 1)
    s = Format(d, "0.00")
    If Len(sepSAP) = 0 Then sepSAP = ","
    If sepFmt <> sepSAP Then s = Replace(s, sepFmt, sepSAP)
    ImporteSAP = s
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

Private Sub Teclear(ByVal tecla As String, sh As Object)
    ' WScript.Shell y no el SendKeys de VBA, que apaga el Bloq Num.
    If sh Is Nothing Then
        SendKeys tecla, True
    Else
        sh.SendKeys tecla
    End If
End Sub

Private Function CrearShell() As Object
    On Error Resume Next
    Set CrearShell = CreateObject("WScript.Shell")
End Function

Private Sub MarcarFila(ws As Worksheet, ByVal f As Long, ByVal col As Long, ByVal estado As String, ByVal bien As Boolean)
    With ws.Cells(f, col)
        .Value = estado
        If bien Then
            .Interior.Color = RGB(198, 239, 206)
        Else
            .Interior.Color = RGB(255, 199, 206)
        End If
    End With
End Sub

' Primera fila con posicion cuya columna de estado no diga "Escrito".
' Una fila sin posicion marca el final de la lista.
Private Function SiguienteFila(ws As Worksheet, ByVal col As Long) As Long
    Dim f As Long
    For f = FILA_INI To FILA_INI + NUM_FILAS - 1
        If CeldaVacia(ws.Cells(f, COL_POS)) Then Exit Function
        If Left$(CStr(ws.Cells(f, col).Value), 7) <> "Escrito" Then
            SiguienteFila = f
            Exit Function
        End If
    Next f
End Function

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

Private Function VentanaSAP() As LongPtr
    ' La ventana de SAP usada mas recientemente (la primera en el orden Z)
    VentanaSAP = FindWindow(SAP_CLASE, vbNullString)
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
    ' Segundo intento por titulo
    On Error Resume Next
    AppActivate TituloVentana(h)
    On Error GoTo 0
    Sleep 200
    ActivarSAP = (GetForegroundWindow() = h)
End Function
