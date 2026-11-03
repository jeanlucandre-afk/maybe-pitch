# Pantalla de carreras: análisis de la referencia (huyml.co)

Observado el 2 de noviembre de 2026 a 1920x1080 en el navegador integrado y con mediciones por fotograma en la propia página. Los valores en píxeles son del lienzo de 1920x1080.

Nota sobre el método: el panel integrado solo devuelve capturas de 800x450. El navegador local sin ventana devuelve 1920x1080 reales, pero su WebGL falla en esa página (error `reading 'uvs'`), así que allí salen el DOM y la transición, no las tarjetas. Las tarjetas se midieron en el panel, leyendo las matrices y uniformes en vivo. Todo esto es solo para entender; no se reutiliza código, imágenes ni fuentes de la referencia.

## Composición

- Fondo gris claro `#ECECEC`. Los bloques van a pantalla completa y sin retícula visible; casi todo el peso está en el contraste entre el texto mínimo y el número enorme.
- Arriba a la izquierda, logo vertical (`x 20`, `y 18–145`) con tres líneas diminutas giradas al lado.
- Cabecera en la línea `y 20`: «Menu» en `x 258` con cuatro entradas grandes debajo (`y 65–145`), luego audio en `x 737`, ciudad y hora en `x 912`, contacto a la derecha.
- Columna izquierda: dos bloques de datos en `y 463` y `y 551`, con etiqueta apagada y valor a su derecha. Ocupan hasta `x 578`, es decir, el 30 % del ancho.
- Centro: la tarjeta activa, de 449x358 px, centrada en `(943, 546)`. Es el 23 % del ancho y el 33 % del alto.
- Derecha: la lista, en una columna de `x 1152` a `x 1920` (40 % del ancho), con el texto centrado en `x 1536` y el elemento activo centrado en `y 540`.
- Abajo a la izquierda: etiqueta «Selected work» en `x 259`, número de 180 px en `x 342–522` (`y 903–1056`) y «/19» arriba a su derecha. Abajo del todo, «Scroll» y a la derecha «'25 showreel».
- Borde derecho: tres cuadritos en `x 1849–1900`, centrados en `y 540`.

## Tarjetas

- Son planos en 3D vistos con cámara ortográfica, sin fuga de perspectiva: en pantalla son paralelogramos. Cada unidad de la escena son 100 px, así que el recorrido es predecible.
- Hay 38 planos en anillo (19 proyectos repetidos dos veces) dibujados en una sola llamada, con un atlas de texturas.
- En reposo se ven unas 9: la activa, unas 5 apiladas arriba a la derecha y unas 3 abajo a la izquierda, cortadas por el borde de la pantalla.
- Una tarjeta apilada mide 423 px de ancho y 281 px de alto. Su borde superior baja hacia la derecha unos 9° y sus lados se inclinan unos 6°. Queda aplastada al 77 % de alto, como una hoja vista de lado.
- La tarjeta activa gira para quedar casi de frente: solo 1° de inclinación y 98 % de su alto.
- Cada paso en la pila desplaza 32 px a la derecha y 62 px hacia arriba. Alrededor de la activa se abre un hueco de 7 pasos a cada lado, por eso su vecina inmediata está a 8 pasos: unos 258 px en horizontal y 497 px en vertical.
- Orden de dibujo: arriba, la más cercana al centro tapa a las que siguen. Abajo, la más alejada del centro tapa a la anterior. Las tarjetas pasan por encima de la lista.
- Al entrar y salir del centro hace dos cosas a la vez: vuela por el hueco y gira en 3D. El giro solo ocurre en el último 80 % de un paso, con suavizado doble, así que parece que «se abre» justo al llegar.
- Con velocidad, cada hoja se dobla: el borde inferior se queda y el resto se desplaza a lo largo de la pila, según una curva suave en su altura. A máxima velocidad, el borde superior se mueve más de 100 px. Esto es lo que más «papel» le da.

## Movimiento

- La rueda no arrastra: suma pasos enteros. Un golpe de 100 px mueve 1 tarjeta y uno de 690 px mueve 4. Siempre termina exactamente en una tarjeta (posición `13.5`, `12.5`, …).
- Respuesta de segundo orden: acelera durante unos 16 fotogramas (0,27 s a 60 Hz), llega a 5,3 tarjetas por segundo en un salto de 4 y luego decae un 4,5 % por fotograma (constante de tiempo de unos 0,36 s). Se detiene sin rebote; a simple vista tarda entre 1,5 y 2 s.
- El suavizado va por fotograma, no por tiempo: en esta máquina, que rinde unos 25–30 fps en esa página, tarda casi el doble.
- Arrastrar y las flechas no hacen nada. Pasar el ratón sí: la tarjeta activa hace un zoom interior del 18 % y una apilada sube 25 px; el cursor cambia a mano. Hacer clic en una apilada no abre: lleva a ella.
- El anillo es infinito; después del último vuelve al primero.

## Número grande

- Va en `mix-blend-mode: difference` con texto blanco. Sobre el gris se ve negro; donde pasa una tarjeta oscura se ve blanco. Ese es el «corte»: la cifra parece recortada por la imagen que pasa detrás.
- El cambio es seco de contenido y suave de foco: justo al cruzar la mitad del recorrido cambia el texto, el desenfoque sube de 0 a 10 px en unos 180 ms y baja a 0 en unos 700 ms. No se traslada ni se desvanece.

## Lista derecha y datos de la izquierda

- El elemento activo va a opacidad 1 y los demás a 0,24. El cruce dura unos 300 ms.
- La lista no sigue la posición continua: da un paso al cruzar la mitad del recorrido, en unos 280 ms, con frenada al final.
- Cada elemento tiene categoría (12 px), título (24 px), una rayita y descripción centrada (12 px, máximo 337 px de ancho).
- La parte superior e inferior de la columna (270 px cada una) se funde con el fondo mediante un degradado por encima del texto.
- Los datos de la izquierda y el resto de textos también van en `difference`. Cambian con el mismo gesto que el número: suben a 8 px de desenfoque y vuelven a 0, ligeramente escalonados por bloque.

## Colores pequeños a la derecha

Tres cuadritos de 15 px con la paleta de la imagen activa. Al cambiar de tarjeta, su color pasa al nuevo en 0,52 s con frenada suave. Son el único color fuera de las imágenes y conectan la interfaz con la imagen sin decir nada.

## Transición al hacer clic y página que abre

1. Tras el clic, un telón negro sube desde abajo con aceleración y frenada, en unos 600 ms.
2. Ya en negro, aparece el título del proyecto en blanco, centrado (unos 64 px), y se queda más o menos 1,4 s.
3. El telón se retira hacia abajo: su borde superior baja y descubre la página nueva, en unos 900 ms. La cabecera sigue en su sitio, como si nunca se hubiera ido.
4. El título gigante en rojo (160 px) aparece abajo a la derecha, desenfocado, y gana nitidez; los datos de la izquierda hacen lo mismo unos 400 ms después.

La página tiene: datos a la izquierda (About, Role, Launch, Recognition y «Visit site →»), imagen principal centrada de 864 px con scroll vertical, título gigante que pisa la imagen, y a la derecha una tira de miniaturas con un marco que indica dónde estás.

## Intro

- Total: unos 9 s hasta que todo está quieto.
- De 0 a 1 s, pantalla negra.
- De 1 a 4 s, un personaje dibujado empuja la pared negra hacia la derecha. Detrás hay blanco y el nombre gigante en rojo.
- Hacia los 5 s, las tarjetas entran por arriba mientras el fondo pasa a gris.
- De 6 a 9 s, el anillo recorre muchas tarjetas frenando hasta la primera, y los textos pasan de 12 px de desenfoque a nítidos.
- En visitas posteriores se conserva la intro.

## Detalles que hacen que se vea cara

- Solo dos tamaños extremos de texto: el diminuto y el gigante. Casi nada intermedio.
- El `difference` en todo el texto: la interfaz reacciona a lo que pasa por detrás.
- El doblado de las hojas con la velocidad: solo se percibe en movimiento, pero se nota su ausencia.
- La frenada larga sin rebote y el giro que llega al final del recorrido.
- Nada aparece con un simple fundido: el foco (desenfoque) hace el trabajo.
- La cabecera no se va nunca, ni durante la transición: da continuidad a todo.
- Tarjetas cortadas por el borde: sugieren que hay mucho más fuera de la pantalla.
- Sin sombras, sin bordes redondeados y sin botones.

## Qué se conserva y qué se adapta

Las decisiones de Boris del 3 de noviembre de 2026 mandan sobre la versión anterior de esta sección y sobre la regla del acento del sistema de marca.

**Se conserva igual**

- La escena: planos en una pila vista con cámara ortográfica, con hueco central, giro al llegar al centro, doblado por velocidad y anillo infinito.
- La respuesta de la rueda: dos etapas de suavizado, sin rebote, siempre termina en una tarjeta. La hago por tiempo, no por fotograma, para que rinda igual en cualquier equipo.
- El reparto: información a la izquierda, tarjeta al centro, lista a la derecha y número abajo a la izquierda.
- Clic en apilada: lleva a ella. Clic en la activa: abre. Zoom interior y subida al pasar el ratón.
- El cambio de número y textos con desenfoque, y la lista que da un paso al cruzar la mitad.
- La transición: telón que sube, título y telón que baja.

**Se adapta**

| Referencia | MAYBE | Por qué |
|---|---|---|
| Gris `#ECECEC` y todo a tinta | Blanco, panel morado `#7C3AED` sólido y un poco de negro | Marca |
| Texto en `difference` | Colores sólidos; el número va debajo de las tarjetas, que lo cortan al pasar | `difference` sobre morado da verde, y no cumple el contraste |
| Texto de 12 px, sin explicar nada | Logo en horizontal, título de 72 px, apoyo, tres pasos y datos de cada carrera, desde 18 px | Un juez debe entenderlo en 3 segundos, en un proyector, sin que nada le quite protagonismo a la tarjeta activa |
| Escenario fijo | Llena la ventana: el lado sobrante del 16:9 se reparte entre panel, tarjetas y lista | Pedido expreso |
| Tarjetas con foto | Fondo sólido, nombre grande arriba, Open Peep y una pieza de interfaz | La banda del nombre es lo que se ve cuando la tarjeta está apilada |
| Tarjetas sin borde, todas iguales | Contorno de tinta de 2,6 px; la activa crece un 40 % | Morado sobre morado no tendría borde; la activa es lo principal de la pantalla |
| Pila con todas las imágenes | Arriba, solo la primera conserva su imagen; abajo, solo la banda con el nombre | Sin caras amontonadas ni textos cortados a la mitad |
| Hueco de 7 pasos a cada lado | 4,7 arriba y 5,5 abajo; la línea se dobla un poco en cada extremo | Para leer los nombres apilados sin tapar la lista ni el número |
| 19 proyectos | 6 carreras en un anillo de 12 | El guion del pitch |
| Transición de unos 5 s | Menos de 3 s, con telón morado y selección de empresa | Es un escenario; no se puede esperar |
| Página del proyecto | El editor de diseño a pantalla completa | Es el siguiente paso de la demo |
| Intro de unos 9 s: un personaje empuja una pared hacia la derecha | Menos de 1,5 s: un Open Peep empuja la pared morada hacia la izquierda y esta se queda como panel | Se salta con cualquier tecla |
| Menú, premios, correo, redes, showreel | Se quitan | Pedido expreso |
| Audio con pistas ajenas | Sonidos propios hechos con Web Audio | Sin archivos de otros |
| Cuadritos con la paleta de cada imagen | Se quitan | Las tarjetas ya solo usan los tres colores de marca |

**Se añade**

- Arrastre con el mouse, que la referencia no tiene: sigue la diagonal de la pila y se detiene en una tarjeta.
- Teclado: ↑ ↓ mueven, Enter abre, Esc vuelve, M activa o quita el sonido. ← → siguen cambiando de diapositiva.
- Botón negro «Try this job», igual en todas las carreras. Solo UX/UI Design abre; en las demás, la tarjeta hace un gesto y suenan dos golpes apagados, sin texto de aviso.
- Tres pasos con un bloque blanco que los recorre y señala los datos de la derecha: «Do the work» marca qué harás y con quién; «Keep the evidence», qué te llevas. Se queda en «Pick a career» mientras se navega y pasa a «Do the work» al abrir.
- `prefers-reduced-motion`: sin intro, sin desenfoque, sin doblado, sin inercia y con los pasos quietos.

## Cómo quedó en MAYBE

- **Contenido:** todo está en un solo sitio, `careers()` dentro de `src/Slide05b2.dc.html`. Después de cambiarlo, ejecuta `node tools/build-deck.mjs`.
- **Estados:** `tried` (conserva «Just tried»), `open` (abre la página de `opens`), `ready` (el resto). Se ven iguales salvo por esa etiqueta.
- **Pantalla completa:** `layout()` en `assets/careers.js` mide la ventana en píxeles del escenario y lo deja en `--cr-w` y `--cr-h`. Un lado vale 1920 o 1080 y el otro es mayor. El deck no cambia.
- **Editor:** UX/UI Design abre `app/design-live.html` en un iframe escalado a toda la ventana, 1440 de ancho si es 16:9. Se monta al terminar la intro de la diapositiva y se retira al salir, así que cada visita empieza de cero. Si el archivo no existe, sale un aviso provisional.
- **Contrato con el editor:**
  - Si existe, se llama a `contentWindow.MAYBE_EDITOR.start({ skipOpening: true })` cuando baja el telón, o al terminar de cargar si aún no estaba listo. Si no existe, no pasa nada. Al volver con Esc y abrir de nuevo, se llama otra vez sin recargar; hoy el editor ignora esa segunda llamada y sigue donde estaba.
  - Debe lanzar `design:finish` en su `document` o en `window.parent.document`; se escuchan los dos.
  - Con el foco dentro, sus teclas suben al deck. Para quedarse con una, debe llamar a `preventDefault()`. Lo que se escribe en un campo de texto no sube, salvo Esc.
  - No debe gastar créditos ni pedir permisos al cargar: se carga antes de que nadie lo abra, y una vez más al abrir el deck, en un `<object>` oculto, para saber si existe. Es la única forma de comprobarlo sin dejar un 404 en la consola.
- **Eventos:** `career:open` y `career:close` en `document`, con `detail { id }`. `design:finish` pasa a la siguiente diapositiva.
- **Dibujo:** WebGL2 sin librerías. Si WebGL2 falta, un lienzo 2D dibuja lo mismo sin el doblado.
- **Selección de empresas:** al abrir UX/UI Design sube el telón, un bloque negro recorre cinco logos blancos, cada vez más lento, se detiene en DICE, y DICE pasa al centro y crece con «Your first task: fix DICE's ticket checkout». Luego baja el telón. Todo corre con un solo reloj desde la pulsación (`PICK` en `assets/careers.js`): unos 2,8 s hasta ver el editor entero. Con `prefers-reduced-motion` se ve DICE directamente. Las empresas y los textos están en `companies()` y `renderVals()` del tablero; el bloque siempre se detiene en la última.
- **Logos:** están en `assets/careers/logos/`, sin modificar. El blanco se aplica por CSS. Bajo los que son solo un símbolo va el nombre (`label` en `companies()`).
  - Spotify, Zalando, N26 y Lufthansa vienen de Simple Icons 13.21.0 (npm `simple-icons`). El paquete es CC0-1.0, pero su `DISCLAIMER.md` avisa de que eso no implica que todos los iconos lo sean y pide comprobar la licencia de cada uno, las guías de cada marca y conseguir los permisos necesarios. En esta versión, ninguno de los cuatro trae dato de licencia, y solo Spotify trae enlace a guías. Las marcas siguen siendo de sus dueños.
  - DICE viene del sistema de marca «MAYBE Product» (`dice-white.svg`). Allí consta como calcado del moodboard, «Stand-in only», y no como archivo oficial.
  - Cerca de cualquier logo de empresa debe ir «Mockup only, no partnership implied».
- **Sonido:** todo sale de `sound` en `assets/careers.js`, sin archivos. Cada carrera tiene su nota, el soplo sigue la velocidad, al abrir sube aire, cada logo tiene un toque y el acorde suena al detenerse en DICE. Se activa por defecto; el navegador lo desbloquea con la primera tecla o clic, y se detiene al salir de la diapositiva. La rueda sola no lo desbloquea: es una regla del navegador.
- **Imágenes:** `assets/careers/<id>.png`, a 1600x1125, exportadas de `assets/careers/montage.html`. Ese archivo explica cómo volver a exportarlas. La franja superior debe quedar para el nombre, porque es lo que se ve con la tarjeta apilada.
