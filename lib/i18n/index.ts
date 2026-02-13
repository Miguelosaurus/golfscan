import { useCallback } from "react";
import { useOnboardingStore } from "@/store/useOnboardingStore";
import type { AppLanguage } from "@/types/onboarding";

const ES: Record<string, string> = {
  // Navigation / common
  "Home": "Inicio",
  "History": "Historial",
  "Profile": "Perfil",
  "Settings": "Configuración",
  "Version": "Versión",
  "Back": "Atrás",
  "Cancel": "Cancelar",
  "OK": "Aceptar",
  "Save": "Guardar",
  "Change": "Cambiar",
  "Delete": "Eliminar",
  "Replay": "Repetir",
  "Success": "Éxito",

  // Settings
  "Account": "Cuenta",
  "Preferences": "Preferencias",
  "Support": "Soporte",
  "Legal": "Legal",
  "Developer": "Desarrollador",
  "Account Actions": "Acciones de cuenta",
  "Language": "Idioma",
  "Notifications": "Notificaciones",
  "Units": "Unidades",
  "Yards": "Yardas",
  "Meters": "Metros",
  "yards": "yardas",
  "meters": "metros",
  "Help & Support": "Ayuda y soporte",
  "About": "Acerca de",
  "Terms & Conditions": "Términos y condiciones",
  "Privacy Policy": "Política de privacidad",
  "Sign Out": "Cerrar sesión",
  "Sign in": "Iniciar sesión",
  "Delete Account": "Eliminar cuenta",
  "ScanCaddie Version": "Versión de ScanCaddie",
  "You": "Tú",

  // Language picker
  "English": "Inglés",
  "Spanish": "Español",
  "Select Language": "Seleccionar idioma",

  // Developer
  "AI Model": "Modelo de IA",
  "Select AI Model": "Seleccionar modelo de IA",
  "Choose the model for scorecard scanning":
    "Elige el modelo para escanear la tarjeta de puntuación",
  "Gemini 3 Flash (faster)": "Gemini 3 Flash (más rápido)",
  "Gemini 3 Pro (best quality)": "Gemini 3 Pro (mejor calidad)",

  // Units picker
  "Current: {{current}}": "Actual: {{current}}",

  // Alerts / dialogs
  "Need help with ScanCaddie? Contact our support team.":
    "¿Necesitas ayuda con ScanCaddie? Contacta a nuestro equipo de soporte.",
  "Email Support": "Enviar correo a soporte",
  "Choose an option": "Elige una opción",

  "Open iOS Settings → Notifications → ScanCaddie to manage alerts.":
    "Abre Configuración de iOS → Notificaciones → ScanCaddie para administrar las alertas.",
  "View our terms and conditions": "Ver nuestros términos y condiciones",
  "View Online": "Ver en línea",

  "View our privacy policy": "Ver nuestra política de privacidad",

  "About ScanCaddie": "Acerca de ScanCaddie",
  "ScanCaddie uses advanced machine learning to scan and analyze your golf scorecards, providing detailed insights into your game.":
    "ScanCaddie utiliza aprendizaje automático avanzado para escanear y analizar tus tarjetas de puntuación, brindando información detallada sobre tu juego.",
  "All rights reserved.": "Todos los derechos reservados.",

  "Not signed in": "No has iniciado sesión",
  "You are not currently signed in.": "Actualmente no has iniciado sesión.",

  "Logout": "Cerrar sesión",
  "Are you sure you want to logout?": "¿Seguro que quieres cerrar sesión?",

  "Replay Onboarding": "Repetir onboarding",
  "This will reset your onboarding preferences and show the welcome screens again.":
    "Esto restablecerá tus preferencias de onboarding y mostrará nuevamente las pantallas de bienvenida.",

  "This will permanently delete your ScanCaddie account and associated data. This cannot be undone.":
    "Esto eliminará permanentemente tu cuenta de ScanCaddie y los datos asociados. No se puede deshacer.",
  "Could not delete your account. Please try again.":
    "No se pudo eliminar tu cuenta. Inténtalo de nuevo.",
  "Error": "Error",
  "Please enter a valid name": "Por favor ingresa un nombre válido",
  "Could not update your profile. Please try again.":
    "No se pudo actualizar tu perfil. Inténtalo de nuevo.",
  "Profile updated successfully": "Perfil actualizado correctamente",
  "Edit Profile": "Editar perfil",
  "Enter your name": "Ingresa tu nombre",
  "Change Profile Photo": "Cambiar foto de perfil",
  "Camera": "Cámara",
  "Photo Library": "Fotos",
  "Permission required": "Permiso requerido",
  "Camera permission is required to take a photo.":
    "Se requiere permiso de cámara para tomar una foto.",
  "Media library permission is required to select a photo.":
    "Se requiere permiso a tus fotos para elegir una imagen.",

  // Profile
  "Profile Information": "Información del perfil",
  "Name": "Nombre",
  "Not set": "Sin configurar",
  "Scandicap": "Scandicap",
  "Member since June 2025": "Miembro desde junio de 2025",
  "Scandicap is calculated from your saved rounds. You can’t manually edit it after onboarding.":
    "Scandicap se calcula a partir de tus rondas guardadas. No puedes editarlo manualmente después del onboarding.",

  // Home / scanning
  "Golf Player": "Jugador de golf",
  "AI is reading your scorecard...": "La IA está leyendo tu tarjeta de puntuación...",
  "Detecting scorecard format...": "Detectando el formato de la tarjeta...",
  "Analyzing handwriting...": "Analizando la escritura...",
  "Identifying players...": "Identificando jugadores...",
  "Extracting scores...": "Extrayendo puntuaciones...",
  "Calculating stats...": "Calculando estadísticas...",
  "Processing scorecard…": "Procesando tarjeta…",
  "Scan failed": "El escaneo falló",
  "Ready to review": "Listo para revisar",
  "Simulate response": "Simular respuesta",
  "Scan in progress": "Escaneo en progreso",
  "Please wait for your current scorecard to finish processing before starting another.":
    "Espera a que termine de procesarse tu tarjeta actual antes de iniciar otra.",
  "Unknown Location": "Ubicación desconocida",
  "Unknown Course": "Campo desconocido",
  "Game": "Ronda",
  "Total": "Total",
  "AVG SCORE": "PROMEDIO",
  "ROUNDS": "RONDAS",
  "SCANDICAP": "SCANDICAP",
  "My rounds": "Mis rondas",
  "No rounds yet": "Aún no hay rondas",
  "Scan your scorecard with AI to add your scores and get your round summary":
    "Escanea tu tarjeta con IA para agregar tus puntuaciones y obtener el resumen de tu ronda",
  "Processing your scorecard...": "Procesando tu tarjeta...",
  "Our AI is reading handwritten scores and identifying players":
    "Nuestra IA está leyendo puntuaciones manuscritas e identificando jugadores",
  "💡 How it works": "💡 Cómo funciona",
  "ScanCaddie uses AI to read handwritten scorecards, identify players, and automatically calculate your stats - all in seconds!":
    "ScanCaddie usa IA para leer tarjetas manuscritas, identificar jugadores y calcular automáticamente tus estadísticas, ¡todo en segundos!",
  "Set up your profile": "Configura tu perfil",
  "Sign in required": "Se requiere iniciar sesión",
  "Please sign in again to save your profile.":
    "Inicia sesión nuevamente para guardar tu perfil.",
  "Could not save your profile. Please try again.":
    "No se pudo guardar tu perfil. Inténtalo de nuevo.",
  "Set Your Handicap": "Configura tu handicap",
  "Handicap Index": "Índice de handicap",
  "Enter your current index": "Ingresa tu índice actual",
  "This seeds your Scandicap so future rounds can adjust it over time.":
    "Esto inicializa tu Scandicap para que las futuras rondas lo ajusten con el tiempo.",
  "Please enter a valid handicap": "Por favor ingresa un handicap válido",
  "Your Scandicap has been seeded.": "Tu Scandicap ha sido inicializada.",
  "Could not seed handicap. Please try again.":
    "No se pudo inicializar tu handicap. Inténtalo de nuevo.",

  // History / lists
  "Rounds": "Rondas",
  "Players": "Jugadores",
  "Courses": "Campos",
  "Search rounds...": "Buscar rondas...",
  "Search players...": "Buscar jugadores...",
  "Search courses...": "Buscar campos...",
  "Search...": "Buscar...",
  "Start tracking your golf rounds by scanning your scorecard.":
    "Empieza a registrar tus rondas escaneando tu tarjeta.",
  "Scan Scorecard": "Escanear tarjeta",
  "No rounds found": "No se encontraron rondas",
  "No players yet": "Aún no hay jugadores",
  "Start tracking your golf rounds to see player statistics.":
    "Empieza a registrar tus rondas para ver estadísticas de jugadores.",
  "No players found": "No se encontraron jugadores",
  "No courses yet": "Aún no hay campos",
  "Add your favorite golf courses to start tracking your rounds.":
    "Agrega tus campos favoritos para empezar a registrar tus rondas.",
  "Add Course": "Agregar campo",
  "No courses found": "No se encontraron campos",
  "Avg. Score": "Puntaje prom.",
  "{{count}} rounds played": "{{count}} rondas jugadas",
  "Dates": "Fechas",
  "This week": "Esta semana",
  "This month": "Este mes",
  "This year": "Este año",
  "Last 30d": "Últ. 30 d",
  "All": "Todas",
  "This Week": "Esta semana",
  "This Month": "Este mes",
  "This Year": "Este año",
  "Last 30 Days": "Últimos 30 días",
  "Custom": "Personalizado",
  "Filter by date": "Filtrar por fecha",
  "Start YYYY-MM-DD": "Inicio AAAA-MM-DD",
  "End YYYY-MM-DD": "Fin AAAA-MM-DD",
  "Apply": "Aplicar",
  "Clear": "Limpiar",
  "Manage": "Gestionar",
  "Merge": "Combinar",
  "Merge {{count}}": "Combinar {{count}}",
  "Cannot Delete": "No se puede eliminar",
  "You cannot delete your own player profile.":
    "No puedes eliminar tu propio perfil de jugador.",
  "Delete Player": "Eliminar jugador",
  "Are you sure you want to delete \"{{name}}\"? This will also delete all their round scores. This action cannot be undone.":
    "¿Seguro que quieres eliminar a \"{{name}}\"? Esto también eliminará todas sus puntuaciones. Esta acción no se puede deshacer.",
  "\"{{name}}\" has been deleted.": "\"{{name}}\" ha sido eliminado.",
  "Failed to delete player": "No se pudo eliminar al jugador",
  "Select 2 Players": "Selecciona 2 jugadores",
  "Please select exactly 2 players to merge.":
    "Selecciona exactamente 2 jugadores para combinar.",
  "Could not find selected players.": "No se pudieron encontrar los jugadores seleccionados.",
  "Merge Players": "Combinar jugadores",
  "Which player should be kept? The other player's scores will be merged into them and then deleted.":
    "¿Qué jugador debe conservarse? Las puntuaciones del otro se combinarán y luego se eliminará.",
  "Keep \"{{name}}\"": "Conservar \"{{name}}\"",
  "Cannot delete your own player profile during merge.":
    "No puedes eliminar tu propio perfil de jugador durante la combinación.",
  "Merged {{count}} scores from \"{{from}}\" into \"{{to}}\".":
    "Se combinaron {{count}} puntuaciones de \"{{from}}\" en \"{{to}}\".",
  "Failed to merge players": "No se pudieron combinar los jugadores",

  // Courses / manual entry
  "Manual Course Entry": "Ingreso manual de campo",
  "Course Information": "Información del campo",
  "Course Name": "Nombre del campo",
  "Enter course name": "Ingresa el nombre del campo",
  "Please enter a course name": "Por favor ingresa el nombre del campo",
  "Location": "Ubicación",
  "Please enter a location": "Por favor ingresa una ubicación",
  "City, State": "Ciudad, estado",
  "Course Rating (optional)": "Course Rating (opcional)",
  "Course rating must be a number": "El Course Rating debe ser un número",
  "Slope Rating (optional)": "Slope Rating (opcional)",
  "Slope rating must be a number": "El Slope Rating debe ser un número",
  "e.g. 72.1": "p. ej., 72.1",
  "e.g. 125": "p. ej., 125",
  "Hole Details": "Detalles de hoyos",
  "Hole": "Hoyo",
  "Par": "Par",
  "Distance": "Distancia",
  "Save Course": "Guardar campo",

  "Add a Golf Course": "Agregar un campo de golf",
  "Search our database of golf courses or add one manually":
    "Busca en nuestra base de datos de campos de golf o agrega uno manualmente",
  "Search Golf Courses": "Buscar campos de golf",
  "Find courses from our comprehensive database with accurate hole information and ratings":
    "Encuentra campos en nuestra base de datos con información precisa de hoyos y ratings",
  "Add Manually": "Agregar manualmente",
  "Create a custom course entry with your own hole information":
    "Crea un campo personalizado con tu propia información de hoyos",
  "Why search our database?": "¿Por qué buscar en nuestra base de datos?",
  "• Accurate hole-by-hole information": "• Información precisa hoyo por hoyo",
  "• Official course ratings and slope": "• Course Rating y Slope oficiales",
  "• Multiple tee box options": "• Múltiples opciones de tees",
  "• Verified course details": "• Detalles verificados del campo",

  // Scan / review
  "Scores": "Puntuaciones",
  "Details": "Detalles",
  "Camera Access Required": "Se requiere acceso a la cámara",
  "We need camera access to scan your scorecard. Please grant permission to continue.":
    "Necesitamos acceso a la cámara para escanear tu tarjeta. Otorga permiso para continuar.",
  "Grant Permission": "Conceder permiso",
  "Link to Existing Player": "Vincular a jugador existente",
  "Remove Link": "Quitar vínculo",
  "Failed to pick image. Please try again.": "No se pudo seleccionar la imagen. Inténtalo de nuevo.",
  "Take Photo": "Tomar foto",
  "Select from Gallery": "Seleccionar de la galería",
  "Add Photo": "Agregar foto",
  "Not Available": "No disponible",
  "Game setup is not available during onboarding. Complete the demo first!":
    "La configuración del juego no está disponible durante el onboarding. ¡Completa la demo primero!",
  "Please take or select at least one photo first.":
    "Toma o selecciona al menos una foto primero.",
  "Setup Game Instead": "Configurar juego en su lugar",
  "Align scorecard within frame": "Alinea la tarjeta dentro del marco",
  "Flip": "Voltear",
  "Detected Players": "Jugadores detectados",
  "Add Player": "Agregar jugador",
  "Player Management": "Gestión de jugadores",
  "• Drag to reorder players if they were detected incorrectly":
    "• Arrastra para reordenar jugadores si se detectaron mal",
  "• Edit names by clicking on them and changing the text":
    "• Edita nombres tocándolos y cambiando el texto",
  "• Link players to existing profiles using the link icon":
    "• Vincula jugadores a perfiles existentes con el ícono de vínculo",
  "• Mark yourself using the user icon":
    "• Márcate a ti mismo con el ícono de usuario",
  "• Set Scandicap and tee colors for accurate scoring":
    "• Configura Scandicap y colores de tee para puntajes correctos",
  "• Tap tee color to cycle through available options":
    "• Toca el color del tee para cambiar entre opciones",
  "Player Name": "Nombre del jugador",
  "Linked": "Vinculado",
  "Tee": "Tee",
  "Review and edit scores for each hole":
    "Revisa y edita las puntuaciones de cada hoyo",
  "Scores look off? Retake a clearer photo.":
    "¿Las puntuaciones no se ven bien? Toma una foto más clara.",
  "Retake": "Repetir",
  "HOLE": "HOYO",
  "PAR": "PAR",
  "Course": "Campo",
  "Search for a course": "Buscar un campo",
  "Date": "Fecha",
  "YYYY-MM-DD": "AAAA-MM-DD",
  "Notes": "Notas",
  "Add notes about this round...": "Agrega notas sobre esta ronda...",
  "Select a Tee": "Selecciona un tee",
  "Men": "Hombres",
  "Women": "Mujeres",
  "No tee data available for this course.":
    "No hay datos de tees disponibles para este campo.",
  "Review Scans": "Revisar escaneos",
  "{{current}} of {{total}}": "{{current}} de {{total}}",
  "Add Pic": "Agregar foto",
  "Analyze Scorecard": "Analizar tarjeta",
  "Camera is not available on web. Please use the upload button below.":
    "La cámara no está disponible en web. Usa el botón de carga abajo.",
  "Setup Game": "Configurar juego",
  "Choose how you'd like to get started":
    "Elige cómo te gustaría empezar",
  "Start a New Game": "Iniciar un juego nuevo",
  "Set up strokes, bets, and games before you play":
    "Configura golpes, apuestas y juegos antes de jugar",
  "Quick Strokes": "Golpes rápidos",
  "Just calculate who gives strokes to whom":
    "Solo calcula quién da golpes a quién",

  // Course details
  "Tees": "Tees",
  "Holes": "Hoyos",
  "Your Performance Stats": "Tus estadísticas",
  "Rounds Played": "Rondas jugadas",
  "Avg Score": "Puntaje prom.",
  "Best Score": "Mejor puntaje",
  "My Course Map": "Mapa del campo",
  "Select tees": "Selecciona tees",
  "All tees": "Todos los tees",
  "Combined averages": "Promedios combinados",
  "Course Map Insight": "Guía del mapa del campo",
  "Each AVG badge shows your all-time scoring average for that hole. Colors highlight how far the average is from par.":
    "Cada insignia AVG muestra tu promedio histórico de puntuación en ese hoyo. Los colores indican qué tan lejos está el promedio del par.",
  "At or near par (≤ +0.1)": "En par o cerca (≤ +0.1)",
  "Bogey range (+0.1 to +1.5)": "Rango de bogey (+0.1 a +1.5)",
  "Double bogey or worse (≥ +1.5)": "Doble bogey o peor (≥ +1.5)",
  "Under Par": "Bajo par",
  "Over Par": "Sobre par",
  "Worst: {{label}}": "Peor: {{label}}",
  "Worst Par Type": "Peor tipo de par",
  "Avg vs Par": "Prom. vs par",
  "No data": "Sin datos",
  "Rounds Played at {{course}}": "Rondas jugadas en {{course}}",
  "Course map info": "Información del mapa del campo",
  "Close": "Cerrar",
  "Got it": "Entendido",

  // Scandicap details
  "Cleared {{rounds}} rounds and {{scores}} scores.":
    "Se eliminaron {{rounds}} rondas y {{scores}} puntuaciones.",
  "Could not clear seeded rounds.": "No se pudieron borrar las rondas sembradas.",
  "History rebuilt.": "Historial reconstruido.",
  "Could not rebuild history.": "No se pudo reconstruir el historial.",
  "Loading Scandicap…": "Cargando Scandicap…",
  "OFFICIAL INDEX": "ÍNDICE OFICIAL",
  "Index Trend": "Tendencia del índice",
  "Seeded Index": "Índice inicial",
  "Play a few rounds to see how your Scandicap evolves over time.":
    "Juega algunas rondas para ver cómo evoluciona tu Scandicap con el tiempo.",
  "Low water mark this period:": "Mejor marca del período:",
  "Once you have rounds with Scandicap differentials, they'll show up here with which ones were used in your index.":
    "Cuando tengas rondas con diferenciales de Scandicap, aparecerán aquí indicando cuáles se usaron en tu índice.",
  "Seed rounds": "Sembrar rondas",
  "What handicap should these seed rounds represent?":
    "¿Qué handicap deberían representar estas rondas iniciales?",
  "Invalid handicap": "Handicap inválido",
  "Enter a valid number (e.g., 15.0).":
    "Ingresa un número válido (p. ej., 15.0).",
  "20 ghost rounds seeded at {{hcp}} handicap.":
    "Se sembraron 20 rondas fantasma con handicap {{hcp}}.",
  "Could not seed rounds.": "No se pudieron sembrar las rondas.",
  "Seed": "Sembrar",
  "Provisional Index": "Índice provisional",
  "Official Scandicap": "Scandicap oficial",
  "Play your first round to establish a Scandicap index.":
    "Juega tu primera ronda para establecer un índice Scandicap.",
  "Estimate based on limited play history.":
    "Estimación basada en un historial de juego limitado.",
  "Official index—maturing toward best 8 of 20.":
    "Índice oficial—madurando hacia el mejor 8 de 20.",
  "Fully established index using best 8 of 20.":
    "Índice completamente establecido usando el mejor 8 de 20.",
  "Once you play and save a round, Scandicap will calculate an estimated handicap based on your scoring versus course difficulty.":
    "Cuando juegues y guardes una ronda, Scandicap calculará un handicap estimado según tu puntuación en relación con la dificultad del campo.",
  "This is a provisional estimate based on your first few differentials. After 3 rounds, your Scandicap becomes official and continues to refine as you play more.":
    "Esta es una estimación provisional basada en tus primeros diferenciales. Después de 3 rondas, tu Scandicap se vuelve oficial y continúa ajustándose a medida que juegas más.",
  "You now have an official Scandicap. As you add rounds, the calculation moves toward the standard “best 8 of your last 20” differentials.":
    "Ahora tienes un Scandicap oficial. A medida que agregas rondas, el cálculo avanza hacia el estándar de “los mejores 8 de tus últimos 20” diferenciales.",
  "Your Scandicap is fully established. It uses the best 8 differentials from your last 20 rounds to give you a fair, accurate index that reflects your current game.":
    "Tu Scandicap está completamente establecido. Usa los mejores 8 diferenciales de tus últimas 20 rondas para darte un índice justo y preciso que refleje tu juego actual.",
  "Fully Mature Index": "Índice plenamente maduro",
  "Maturity: {{count}}/20 rounds": "Madurez: {{count}}/20 rondas",
  "Official Status: Established": "Estado oficial: establecido",
  "Status: Provisional": "Estado: provisional",
  "You have played 3 or more rounds. This index is officially valid for handicap purposes and fair play.":
    "Has jugado 3 o más rondas. Este índice es oficialmente válido para fines de handicap y juego justo.",
  "You have played fewer than 3 rounds. This index is an estimate. Play more rounds to unlock your official Established status.":
    "Has jugado menos de 3 rondas. Este índice es una estimación. Juega más rondas para desbloquear tu estado oficial establecido.",
  "ESTABLISHED": "ESTABLECIDO",
  "PROVISIONAL": "PROVISIONAL",
  "{{count}} rounds in window": "{{count}} rondas en la ventana",
  "Play consistent golf to improve your index.":
    "Juega de forma consistente para mejorar tu índice.",
  "How Scandicap Works": "Cómo funciona Scandicap",
  "Calculation History": "Historial de cálculo",

  // Common / misc
  "Handicap": "Hándicap",
  "Summary": "Resumen",
  "Scorecard": "Tarjeta",
  "Stats": "Estadísticas",
  "Pending sync": "Sincronización pendiente",
  "Sync failed": "Falló la sincronización",
  "Final Standings": "Clasificación final",
  "Stroke Play": "Juego por golpes",
  "Match Play": "Juego por hoyos",
  "Skins": "Skins",
  "Nassau": "Nassau",
  "PLAYER": "JUGADOR",
  "WINNER": "GANADOR",
  "GROSS": "BRUTO",
  "NET": "NETO",
  "Standings available after the round is complete.":
    "La clasificación estará disponible cuando la ronda termine.",
  "Settlements": "Liquidaciones",
  "Total Pot: {{amount}}": "Pozo total: {{amount}}",
  "BREAKDOWN": "DESGLOSE",
  "Unknown": "Desconocido",
  "Game settlement": "Liquidación del juego",
  "Source Scan": "Escaneo original",
  "Uploaded": "Subido",
  "Uploaded at {{time}}": "Subido a las {{time}}",
  "View": "Ver",
  "View Detailed Stats": "Ver estadísticas detalladas",
  "Actual vs Adjusted": "Real vs ajustado",
  "Adjusted is for handicap posting (WHS Net Double Bogey caps). It can be lower than your gross.\n\nNet score in the Stats tab is different: Gross − Course Handicap.":
    "Ajustado es para publicar el handicap (límites WHS de doble bogey neto). Puede ser menor que tu score bruto.\n\nEl puntaje neto en la pestaña de estadísticas es distinto: Bruto − Handicap del campo.",
  "Processing...": "Procesando...",
  "Failed to scan scorecard. Please try again.":
    "No se pudo escanear la tarjeta. Inténtalo de nuevo.",
  "Review your round and save when ready.":
    "Revisa tu ronda y guarda cuando estés listo.",
  "Course Details": "Detalles del campo",
  "Player Profile": "Perfil del jugador",
  "New Round": "Nueva ronda",
  "Unknown location": "Ubicación desconocida",

  // Auth
  "Enter email": "Ingresa el correo",
  "Enter password": "Ingresa la contraseña",
  "Don't have an account?": "¿No tienes cuenta?",
  "Sign up": "Crear cuenta",
  "Sign up with Apple": "Registrarse con Apple",
  "Sign up with Google": "Registrarse con Google",
  "or": "o",
  "Sign up error": "Error al registrarse",
  "Sign up failed. Please try again.": "No se pudo registrar. Inténtalo de nuevo.",
  "Sign In Failed": "Inicio de sesión fallido",
  "No session was created. Please try again.":
    "No se creó una sesión. Inténtalo de nuevo.",
  "Please try again.": "Inténtalo de nuevo.",
  "Email Required": "Correo requerido",
  "Please enter your email address.": "Por favor ingresa tu correo.",
  "Loading": "Cargando",
  "Please wait a moment and try again.":
    "Espera un momento e inténtalo de nuevo.",
  "Could not send verification code. Please try again.":
    "No se pudo enviar el código de verificación. Inténtalo de nuevo.",
  "Code Required": "Código requerido",
  "Please enter the verification code from your email.":
    "Por favor ingresa el código de verificación de tu correo.",
  "Verification Failed": "Verificación fallida",
  "Invalid Code": "Código inválido",
  "Please check the code and try again.":
    "Revisa el código e inténtalo de nuevo.",
  "Could not finish setup.": "No se pudo terminar la configuración.",
  "Verify your email": "Verifica tu correo",
  "Verification code": "Código de verificación",
  "Verify": "Verificar",
  "Create your account": "Crea tu cuenta",
  "Email": "Correo",
  "Password": "Contraseña",
  "Already have an account?": "¿Ya tienes cuenta?",
  "Sign in to save rounds, sync your Scandicap, and access your history anywhere.":
    "Inicia sesión para guardar rondas, sincronizar tu Scandicap y acceder a tu historial desde cualquier lugar.",

  // Onboarding
  "Snap your scorecard": "Fotografía tu tarjeta",
  "AI reads your scores instantly": "La IA lee tus puntuaciones al instante",
  "Track your Scandicap™": "Sigue tu Scandicap™",
  "Watch your handicap evolve": "Mira cómo evoluciona tu handicap",
  "Settle bets fairly": "Liquida apuestas de forma justa",
  "Automatic stroke calculations": "Cálculos automáticos de golpes",
  "The smartest way to track your golf game":
    "La forma más inteligente de seguir tu golf",
  "Get Started": "Comenzar",
  "By continuing, you agree to our Terms of Service":
    "Al continuar, aceptas nuestros Términos de servicio",
  "What should we call you?": "¿Cómo te llamamos?",
  "Your name": "Tu nombre",
  "What's your age range?": "¿Cuál es tu rango de edad?",
  "This helps us tailor insights to golfers like you":
    "Esto nos ayuda a adaptar los análisis a golfistas como tú",
  "Do you have an established handicap?": "¿Tienes un handicap establecido?",
  "We can pick up right where you left off":
    "Podemos continuar justo donde lo dejaste",
  "Yes, I have a handicap": "Sí, tengo handicap",
  "Import your current index": "Importa tu índice actual",
  "Your handicap index": "Tu índice de handicap",
  "e.g. 15.4": "p. ej. 15.4",
  "This will be your starting Scandicap™": "Este será tu Scandicap™ inicial",
  "No, I'm new or casual": "No, soy nuevo o casual",
  "We'll build your Scandicap™ from your rounds":
    "Crearemos tu Scandicap™ a partir de tus rondas",
  "Your official handicap index, calculated automatically after every round using the World Handicap System.":
    "Tu índice de handicap oficial, calculado automáticamente después de cada ronda usando el World Handicap System.",
  "Neat": "Prolija",
  "Clear, well-formed numbers": "Números claros y bien formados",
  "Average": "Normal",
  "Typical everyday handwriting": "Escritura típica del día a día",
  "Rushed": "Apurada",
  "Quick scribbles, harder to read": "Garabatos rápidos, más difíciles de leer",
  "One Photo. Everything Captured.": "Una foto. Todo capturado.",
  "Just snap your scorecard at the end of the round. Select your handwriting style for 99% accuracy.":
    "Solo toma una foto de tu tarjeta al final de la ronda. Elige tu estilo de escritura para 99% de precisión.",
  "Saving preferences...": "Guardando preferencias...",
  "Downloading {{style}} OCR model...": "Descargando el modelo OCR {{style}}...",
  "Configuring database...": "Configurando la base de datos...",
  "Optimizing for {{unit}}...": "Optimizando para {{unit}}...",
  "Configuration Complete": "Configuración completa",
  "Setting Up ScanCaddie": "Configurando ScanCaddie",
  "But if you want more...": "Pero si quieres más...",
  "Game Day Ready": "Listo para el día de juego",
  "Set up friendly games or bets before playing. We handle all the scoring — just scan at the end to settle everything.":
    "Configura juegos o apuestas antes de jugar. Nosotros hacemos los cálculos — solo escanea al final para liquidar todo.",
  "Automatic bet settlement with handicap strokes applied":
    "Liquidación automática de apuestas con golpes de handicap aplicados",
  "Optional — you can always just scan without setting up a game":
    "Opcional: siempre puedes escanear sin configurar un juego",
  "Got It": "Entendido",
  "Ready to try it?": "¿Listo para probarlo?",
  "See how fast we digitize your scorecards":
    "Mira qué tan rápido digitalizamos tus tarjetas",
  "Sample Scorecard": "Tarjeta de ejemplo",
  "I have a scorecard ready": "Tengo una tarjeta lista",
  "Scan it now and see your scores instantly":
    "Escanéala ahora y ve tus puntuaciones al instante",
  "Try a demo scan": "Probar un escaneo de demo",
  "See how it works with a sample scorecard":
    "Mira cómo funciona con una tarjeta de ejemplo",
  "Demo: Position scorecard": "Demo: Coloca la tarjeta",
  "This is a sample scorecard - tap capture when ready":
    "Esta es una tarjeta de ejemplo; toca capturar cuando estés listo",
  "Tap to capture": "Toca para capturar",
  "Scorecard captured!": "¡Tarjeta capturada!",
  "Ready to analyze with our AI": "Listo para analizar con nuestra IA",
  "Reading your scorecard...": "Leyendo tu tarjeta...",
  "Our AI is extracting player names and scores":
    "Nuestra IA está extrayendo nombres y puntuaciones",
  "Image captured": "Imagen capturada",
  "Detecting scorecard layout": "Detectando el diseño de la tarjeta",
  "Reading handwritten scores...": "Leyendo puntuaciones manuscritas...",

  // Paywall / Courses
  "Unlock ScanCaddie Pro": "Desbloquea ScanCaddie Pro",
  "Get unlimited access to all features":
    "Acceso ilimitado a todas las funciones",
  "Unlimited scorecard scans": "Escaneos ilimitados de tarjetas",
  "Automatic Scandicap™ tracking": "Seguimiento automático de Scandicap™",
  "Bet settlement calculator": "Calculadora de liquidación de apuestas",
  "Full round history": "Historial completo de rondas",
  "Strokes Gained analytics": "Analíticas de strokes gained",
  "Weekly": "Semanal",
  "Annual": "Anual",
  "Lifetime": "De por vida",
  "/week": "/semana",
  "/year": "/año",
  "one-time": "pago único",
  "Best Value": "Mejor valor",
  "Save 80%": "Ahorra 80%",
  "Start Free Trial": "Iniciar prueba gratuita",
  "Continue with limited features":
    "Continuar con funciones limitadas",
  "Cancel anytime. Terms apply.":
    "Cancela cuando quieras. Se aplican términos.",
  "My Courses": "Mis campos",
  "Search": "Buscar",
  "Select Tee Box": "Selecciona tee",
  "Search for golf courses...": "Buscar campos de golf...",
  "Searching courses...": "Buscando campos...",
  "Can't find your course?": "¿No encuentras tu campo?",
  "Add it manually below.": "Agrégalo manualmente abajo.",
  "Add Course Manually": "Agregar campo manualmente",
  "No courses saved yet": "Aún no hay campos guardados",
  "Save courses by playing rounds to see them here":
    "Guarda campos jugando rondas para verlos aquí",
  "Choose your tee box:": "Elige tu tee:",
  "Failed to search courses. Please check your internet connection and try again.":
    "No se pudieron buscar campos. Revisa tu conexión e inténtalo de nuevo.",
  "Course Error": "Error del campo",
  "We could not prepare this course right now. Please try again.":
    "No pudimos preparar este campo ahora. Inténtalo de nuevo.",
  "Nearby Courses": "Campos cercanos",

  // Active session
  "Please enter a valid hole number":
    "Por favor ingresa un número de hoyo válido",
  "This is a front 9 round - only front segment presses are allowed":
    "Esta es una ronda de 9 hoyos (front) — solo se permiten presses del frente",
  "This is a back 9 round - only back segment presses are allowed":
    "Esta es una ronda de 9 hoyos (back) — solo se permiten presses del fondo",
  "Front segment presses must start on holes 1-9":
    "Los presses del frente deben empezar en hoyos 1-9",
  "Back segment presses must start on holes 10-18":
    "Los presses del fondo deben empezar en hoyos 10-18",
  "Please select which matchup to press":
    "Selecciona qué enfrentamiento quieres presionar",
  "Unable to identify current user. Please try again.":
    "No pudimos identificar al usuario actual. Inténtalo de nuevo.",
  "Failed to add press": "No se pudo agregar el press",
  "Active Session": "Sesión activa",
  "Loading session...": "Cargando sesión...",
  "1 vs 1": "1 vs 1",
  "2 vs 2": "2 vs 2",
  "Everyone vs Everyone": "Todos contra todos",
  "Stroke Allocation": "Asignación de golpes",
  "Scratch": "Scratch",
  "Bet": "Apuesta",
  "Carryover enabled": "Carryover activado",
  "Choose Matchup": "Elegir enfrentamiento",
  "Start Hole": "Hoyo inicial",
  "Adding...": "Agregando...",
  "Confirm Press": "Confirmar press",
  "Segment": "Segmento",
  "1 stroke on all holes": "1 golpe en todos los hoyos",
  "plus 2nd stroke on:": "más un 2.º golpe en:",
  "Strokes on holes:": "Golpes en los hoyos:",
  "Matchup": "Enfrentamiento",
  "Side A": "Lado A",
  "Side B": "Lado B",
  "Presses enabled (threshold: {{count}} down)":
    "Presses activados (umbral: {{count}} abajo)",

  // Player / stats
  "Unknown Player": "Jugador desconocido",
  "Loading player…": "Cargando jugador…",
  "No data for this player yet": "Aún no hay datos de este jugador",
  "Save a round with this player to view stats.":
    "Guarda una ronda con este jugador para ver estadísticas.",
  "Blow-Up Holes/Rd": "Hoyos de desastre/ronda",
  "Average number of holes per round where you scored triple bogey or worse.":
    "Promedio de hoyos por ronda donde hiciste triple bogey o peor.",
  "Average number of holes per round where {{name}} scored triple bogey or worse.":
    "Promedio de hoyos por ronda donde {{name}} hizo triple bogey o peor.",
  "How many strokes over/under par you typically shoot each round.":
    "Cuántos golpes sobre/bajo par sueles hacer en cada ronda.",
  "How many strokes over/under par {{name}} typically shoots each round.":
    "Cuántos golpes sobre/bajo par suele hacer {{name}} en cada ronda.",
  "Net Earnings": "Ganancias netas",
  "Won": "Ganado",
  "Lost": "Perdido",
  "Best Win": "Mejor victoria",
  "Your ATM": "Tu cajero",
  "Wager History": "Historial de apuestas",
  "You won": "Ganaste",
  "You lost": "Perdiste",
  "Key Insights": "Puntos clave",
  "Par 3s": "Par 3",
  "Par 4s": "Par 4",
  "Par 5s": "Par 5",
  "Hard (HCP 1-6)": "Difícil (HCP 1-6)",
  "Medium (7-12)": "Medio (7-12)",
  "Easy (13-18)": "Fácil (13-18)",
  "Score Distribution": "Distribución de puntajes",
  "Score Distribution (All-Time)": "Distribución de puntajes (histórica)",
  "Play a few more rounds to see your scoring mix.":
    "Juega algunas rondas más para ver tu mezcla de puntuación.",
  "Recent Rounds": "Rondas recientes",
  "View All Rounds": "Ver todas las rondas",
  "Eagles": "Eagles",
  "Birdies": "Birdies",
  "Pars": "Pars",
  "Bogeys": "Bogeys",
  "Doubles": "Dobles",
  "Worse": "Peor",

  // Head-to-head
  "Head-to-Head": "Cara a cara",
  "You haven't played any rounds with {{name}} yet.":
    "Aún no has jugado rondas con {{name}}.",
  "Play a round together to see your head-to-head stats!":
    "Jueguen una ronda juntos para ver sus estadísticas cara a cara.",
  "1 round played together": "1 ronda jugada juntos",
  "{{count}} rounds played together": "{{count}} rondas jugadas juntos",
  "Head-to-Head vs {{name}}": "Cara a cara vs {{name}}",
  "Your Record": "Tu récord",
  "Your Avg": "Tu prom.",
  "Their Avg": "Su prom.",
  "Margin": "Margen",
  "Recent Matchups": "Enfrentamientos recientes",
  "vs": "vs",

  // Score trend
  "Score Trend": "Tendencia de puntaje",
  "Score": "Puntaje",
  "5-Round Avg": "Prom. 5 rondas",
  "Play a few more rounds to see your scoring trend.":
    "Juega algunas rondas más para ver tu tendencia de puntaje.",

  // Round card
  "Score:": "Puntaje:",
  "Best Score:": "Mejor puntaje:",
  "player": "jugador",
  "players": "jugadores",

  // Scan review
  "Remove Player": "Eliminar jugador",
  "Are you sure you want to remove this player?":
    "¿Seguro que quieres eliminar a este jugador?",
  "Remove": "Eliminar",
  "Session Players": "Jugadores de la sesión",
  "Select Your Player": "Selecciona tu jugador",
  "Tap the person icon next to your name to link scores to your profile and track your handicap.":
    "Toca el ícono de persona junto a tu nombre para vincular los puntajes a tu perfil y seguir tu handicap.",
  "Score Assignment": "Asignación de puntajes",
  "Players are from your pre-round setup":
    "Los jugadores vienen de tu configuración previa a la ronda",
  "Scores are automatically matched to players":
    "Los puntajes se asignan automáticamente a los jugadores",
  "Tap \"Detected as\" to cycle through options":
    "Toca \"Detectado como\" para cambiar entre opciones",
  "Drag to reorder players if they were detected incorrectly":
    "Arrastra para reordenar jugadores si se detectaron mal",
  "Edit names by clicking on them and changing the text":
    "Edita los nombres tocándolos y cambiando el texto",
  "Link players to existing profiles using the link icon":
    "Vincula jugadores a perfiles existentes usando el ícono de enlace",
  "Mark yourself using the user icon":
    "Márcate a ti mismo usando el ícono de usuario",
  "Set Scandicaps and tee colors for accurate scoring":
    "Configura Scandicaps y colores de tee para un puntaje preciso",
  "Tap tee color to cycle through available options":
    "Toca el color del tee para cambiar entre opciones disponibles",
  "Ties carry over": "Los empates se arrastran",
  "Tap an amount to edit": "Toca un monto para editar",
  "Per Match": "Por match",
  "Per Hole": "Por hoyo",
  "Per Skin": "Por skin",
  "Buy-in": "Entrada",
  "Per Stroke": "Por golpe",
  "Tap to edit": "Toca para editar",
  "Tied holes carry over to next skin":
    "Los hoyos empatados se arrastran al siguiente skin",
  "Side Bets": "Apuestas secundarias",
  "Greenies": "Greenies",
  "Sandies": "Sandies",
  "{{amount}} each": "{{amount}} cada uno",
  "Overall": "Total",

  // Round details
  "Even": "Par",
  "Delete Round": "Eliminar ronda",
  "Are you sure you want to delete this round?":
    "¿Seguro que quieres eliminar esta ronda?",
  "Round not found": "Ronda no encontrada",
  "Go Back": "Volver",
  "Could not delete round. Please try again.":
    "No se pudo eliminar la ronda. Inténtalo de nuevo.",
  "No existing players found.": "No se encontraron jugadores existentes.",

  // Seed rounds story
  "Seeding your starting index": "Inicializando tu índice",
  "Creating 20 seed rounds, then locking in your Scandicap™.":
    "Creando 20 rondas iniciales y fijando tu Scandicap™.",
  "We’ll generate 20 seed rounds after sign-in so your Scandicap™ starts at the right place.":
    "Generaremos 20 rondas iniciales después de iniciar sesión para que tu Scandicap™ empiece en el lugar correcto.",
  "Index": "Índice",
  "Seeding…": "Inicializando…",
  "Seeds are marked as synthesized and get replaced naturally as you add real rounds.":
    "Las rondas iniciales se marcan como sintetizadas y se reemplazan naturalmente a medida que agregas rondas reales.",

  // Settlement
  "Results": "Resultados",
  "Settlement": "Liquidación",
  "owes": "le debe a",
  "Results:": "Resultados:",
  "won": "ganó",
  "Who Owes Whom:": "Quién le debe a quién:",
  "All settled up! 🎉": "¡Todo saldado! 🎉",
  "Your Balance": "Tu balance",
  "Share Results": "Compartir resultados",

  // Onboarding complete screen
  "Check your email": "Revisa tu correo",
  "We sent a verification code to {{email}}":
    "Enviamos un código de verificación a {{email}}",
  "Enter code": "Ingresa el código",
  "You're all set!": "¡Todo listo!",
  "Sign in to save rounds, sync your Scandicap, access your history anywhere, and to pull in your handicap.":
    "Inicia sesión para guardar rondas, sincronizar tu Scandicap, acceder a tu historial desde cualquier lugar y usar tu handicap.",
  "Continue with Apple": "Continuar con Apple",
  "Continue with Google": "Continuar con Google",
  "Skip for now": "Omitir por ahora",
  "You can sign in later from Settings":
    "Puedes iniciar sesión más tarde desde Configuración",
  "Setting up your account": "Configurando tu cuenta",
  "Creating your seed rounds": "Creando tus rondas iniciales",
  "Calculating your Scandicap™": "Calculando tu Scandicap™",
  "Ready to go": "Listo para comenzar",
  "Almost there": "Casi listo",
  "Syncing your profile…": "Sincronizando tu perfil…",
  "Seeding 20 ghost rounds from your handicap…":
    "Sembrando 20 rondas fantasma desde tu handicap…",
  "Building your starting handicap history…":
    "Construyendo tu historial inicial de handicap…",
  "Opening the app…": "Abriendo la app…",
  "We’ll finish setup in the background. You can continue now.":
    "Terminaremos la configuración en segundo plano. Puedes continuar ahora.",

  // Player selector
  "Select Players": "Seleccionar jugadores",
  "Add new player": "Agregar jugador nuevo",

  // Pre-round flow
  "Start Game": "Iniciar juego",
  "Continue without betting": "Continuar sin apostar",
  "Select Tee": "Seleccionar tee",
  "Men's Tees": "Tees de hombres",
  "Women's Tees": "Tees de mujeres",
  "Add players for your round.": "Agrega jugadores para tu ronda.",
  "Add some friendly competition with side bets.":
    "Agrega competencia amistosa con apuestas secundarias.",
  "Create new player...": "Crear nuevo jugador...",
  "Create": "Crear",
  "Add": "Agregar",
  "No other players found.": "No se encontraron otros jugadores.",

  // General UI (translation sweep)
  "Activity": "Actividad",
  "Activity Calendar": "Calendario de actividad",
  "1 round played": "1 ronda jugada",
  "2 rounds played": "2 rondas jugadas",
  "3+ rounds played": "3+ rondas jugadas",
  "No rounds played": "Ninguna ronda jugada",
  "This calendar shows your golf activity throughout the year. Each square represents a day:":
    "Este calendario muestra tu actividad de golf durante el año. Cada cuadro representa un día:",
  "The more you play, the more filled out your calendar becomes!":
    "¡Cuanto más juegas, más se llena tu calendario!",

  "Oops!": "¡Ups!",
  "This screen doesn't exist.": "Esta pantalla no existe.",
  "Go to home screen!": "¡Ir a la pantalla de inicio!",

  "Modal": "Modal",
  "This is an example modal. You can edit it in app/modal.tsx.":
    "Este es un ejemplo de modal. Puedes editarlo en app/modal.tsx.",

  "Continue": "Continuar",
  "Done": "Listo",
  "Max": "Máx.",
  "Select": "Seleccionar",
  "Player": "Jugador",
  "Tee:": "Tee:",
  "Scandicap:": "Scandicap:",

  // Navigation / screens
  "Game Setup": "Configuración del juego",
  "Game Type": "Tipo de juego",
  "Round Details": "Detalles de la ronda",
  "Review Scorecard": "Revisar tarjeta",
  "Review Your Round": "Revisa tu ronda",
  "Scorecard Results": "Resultados de la tarjeta",
  "Pre-Round": "Pre-ronda",
  "Edit Round": "Editar ronda",
  "Save Round": "Guardar ronda",
  "Scandicap Details": "Detalles de Scandicap",
  "Scan Post-Round": "Escanear post-ronda",
  "Scan a scorecard from a round you've already played":
    "Escanea una tarjeta de una ronda que ya jugaste",

  // Game / betting
  "Choose Game Type": "Elegir tipo de juego",
  "Requires at least 2 players": "Requiere al menos 2 jugadores",
  "Max 4 players supported": "Máximo 4 jugadores",
  "Lowest total score wins": "Gana el puntaje total más bajo",
  "Win the most holes": "Gana la mayor cantidad de hoyos",
  "Front 9 + Back 9 + Overall": "Primeros 9 + Últimos 9 + Total",
  "Win each hole individually": "Gana cada hoyo individualmente",

  "Competition Format": "Formato de competencia",
  "How do you want to compete?": "¿Cómo quieres competir?",
  "Each player competes individually (6 matchups)":
    "Cada jugador compite individualmente (6 enfrentamientos)",
  "Head-to-head match between two players":
    "Enfrentamiento directo entre dos jugadores",
  "Team competition": "Competencia por equipos",
  "Sides & Teams": "Lados y equipos",
  "Tap to swap players.": "Toca para intercambiar jugadores.",
  "Team 1": "Equipo 1",
  "Team 2": "Equipo 2",
  "VS": "VS",

  "Betting (Optional)": "Apuestas (opcional)",
  "Enable Betting": "Activar apuestas",
  "Nassau Bet Amounts": "Montos de apuesta Nassau",
  "Set separate amounts for Front, Back, and Overall":
    "Configura montos separados para los primeros 9, los últimos 9 y el total",
  "Bet Type": "Tipo de apuesta",
  "Bets": "Apuestas",
  "Bet amount": "Monto de apuesta",
  "Amount per match": "Monto por match",
  "Amount per hole": "Monto por hoyo",
  "Amount per skin": "Monto por skin",
  "Amount per stroke": "Monto por golpe",
  "Buy-in amount": "Monto de entrada",
  "Winner Takes All": "El ganador se lleva todo",
  "Winner takes all": "El ganador se lleva todo",
  "Fixed payout": "Pago fijo",
  "Carryover Ties": "Empates se arrastran",
  "Value carries to next hole on ties":
    "El valor se arrastra al siguiente hoyo en caso de empate",
  "Allow Presses": "Permitir presses",
  "Double down when losing by 2+ holes":
    "Doblar apuesta al ir perdiendo por 2+ hoyos",
  "Side Bets (Junk)": "Apuestas secundarias (extras)",
  "Optional bonus payouts": "Pagos extra opcionales",
  "Side Bet Amount": "Monto de apuesta secundaria",
  "Per greenie, sandy, or birdie won":
    "Por cada greenie, sandy o birdie ganado",
  "Hit par-3 green & make par+": "Pega green de par 3 y haz par o mejor",
  "Make par after bunker shot": "Haz par después de un tiro desde el búnker",
  "Make birdie on any hole": "Haz birdie en cualquier hoyo",
  "$X for each hole won": "$X por cada hoyo ganado",
  "$X × stroke margin": "$X × diferencia de golpes",
  "Front 9": "Primeros 9",
  "Back 9": "Últimos 9",
  "Front 9 amount": "Monto de los primeros 9",
  "Back 9 amount": "Monto de los últimos 9",
  "Overall amount": "Monto total",
  "Presses": "Presses",
  "Add Press": "Agregar press",
  "Starting Hole": "Hoyo inicial",
  "No presses added yet": "Aún no se agregaron presses",
  "Failed to remove press": "No se pudo eliminar el press",
  "Edit Bet Amount": "Editar monto de apuesta",
  "Failed to update bet": "No se pudo actualizar la apuesta",
  "Please enter a valid amount": "Ingresa un monto válido",

  // Round stats / labels
  "Actual": "Real",
  "Adjusted": "Ajustado",
  "PAR 3": "PAR 3",
  "PAR 4": "PAR 4",
  "PAR 5": "PAR 5",
  "Birdie": "Birdie",
  "Bogey": "Bogey",
  "Other": "Otro",
  "GROSS SCORE": "PUNTAJE BRUTO",
  "NET SCORE": "PUNTAJE NETO",
  "Scoring Distribution": "Distribución de puntuación",
  "Most common score:": "Puntaje más común:",
  "{{count}} Holes": "{{count}} hoyos",
  "{{count}} over par": "{{count}} sobre par",
  "{{count}} under par": "{{count}} bajo par",
  "Viewing stats for:": "Viendo estadísticas de:",
  "Performance by Par": "Rendimiento por par",
  "Performance vs Difficulty": "Rendimiento vs dificultad",
  "Average score relative to par for Par 3s, 4s, and 5s.":
    "Puntaje promedio relativo al par en Par 3, 4 y 5.",
  "Average score relative to par grouped by hole handicap (hard, medium, easy).":
    "Puntaje promedio relativo al par agrupado por hándicap del hoyo (difícil, medio, fácil).",
  "Highlights": "Destacados",
  "Best Hole": "Mejor hoyo",
  "Worst Hole": "Peor hoyo",
  "Quick Notes": "Notas rápidas",

  // Course / pre-round
  "18 Holes": "18 hoyos",
  "Choose your course and holes for today.": "Elige tu campo y los hoyos de hoy.",
  "Tap to select a course": "Toca para seleccionar un campo",
  "Set up a game or scan a scorecard": "Configura un juego o escanea una tarjeta",
  "No players added yet": "Aún no se agregaron jugadores",
  "Ready to Play!": "¡Listo para jugar!",

  // Scanning / linking
  "Scan Failed": "Escaneo fallido",
  "Original Scorecard": "Tarjeta original",
  "Failed to take picture. Please try again.":
    "No se pudo tomar la foto. Inténtalo de nuevo.",
  "No players detected. Please try scanning again or add players manually":
    "No se detectaron jugadores. Intenta escanear de nuevo o agrega jugadores manualmente",
  "All players must have names": "Todos los jugadores deben tener nombre",
  "Detected as": "Detectado como",
  "Tap to assign": "Toca para asignar",
  "Link Yourself": "Vincularte",
  "Link as Me": "Vincular como yo",
  "Continue Without Linking": "Continuar sin vincular",
  "Continue without linking to create a new player profile.":
    "Continúa sin vincular para crear un perfil nuevo.",
  "Please link at least one player as \"{{you}}\" by tapping on the player card and tapping the \"{{linkAsMe}}\" button.":
    "Vincula al menos un jugador como \"{{you}}\" tocando la tarjeta del jugador y luego el botón \"{{linkAsMe}}\".",
  "Please enter scores for all holes": "Ingresa puntajes para todos los hoyos",
  "Please select a course before continuing": "Selecciona un campo antes de continuar",

  // Session creation
  "Missing Info": "Falta información",
  "Please complete all required fields.": "Completa todos los campos requeridos.",
  "Game Created!": "¡Juego creado!",
  "Your game session is ready. Scan your scorecard when finished!":
    "Tu sesión de juego está lista. Escanea tu tarjeta cuando termines.",
  "Failed to create game session. Please try again.":
    "No se pudo crear la sesión de juego. Inténtalo de nuevo.",

  // Misc
  "Lowest score wins": "Gana el puntaje más bajo",
  "Most holes won": "Gana más hoyos",
  "How the winner will be determined": "Cómo se determinará el ganador",
  "aka": "alias",
  "{{progress}}% complete": "{{progress}}% completado",

  // Charts / rules
  "Based on Best Player": "Basado en el mejor jugador",
  "Full Handicap": "Hándicap completo",
  "Get Strokes": "Recibe golpes",
  "HCP": "HCP",
  "Here's how this game works:": "Así funciona este juego:",

  // Game rules
  "Each player counts every stroke taken during the round.":
    "Cada jugador cuenta cada golpe realizado durante la ronda.",
  "The player with the lowest total net score wins.":
    "El jugador con el puntaje neto total más bajo gana.",
  "Net score = Gross score - Handicap strokes received.":
    "Puntaje neto = puntaje bruto − golpes de hándicap recibidos.",
  "Ties are usually split or decided by a playoff.":
    "Los empates normalmente se reparten o se deciden en un desempate.",
  "Players compete hole by hole.": "Los jugadores compiten hoyo por hoyo.",
  "The player with the lowest net score on each hole wins that hole.":
    "El jugador con el puntaje neto más bajo en cada hoyo gana ese hoyo.",
  "The player who wins the most holes wins the match.":
    "El jugador que gana más hoyos gana el match.",
  "Strokes are given based on the difference between handicaps.":
    "Los golpes se otorgan según la diferencia entre hándicaps.",
  "If tied after 18 holes, the match is \"all square\" (tie).":
    "Si hay empate tras 18 hoyos, el match queda \"all square\" (empate).",
  "Three separate bets in one: Front 9, Back 9, and Overall 18.":
    "Tres apuestas en una: primeros 9, últimos 9 y total (18).",
  "Each segment is essentially a mini match play competition.":
    "Cada segmento es, en esencia, una mini competencia de match play.",
  "Win the most holes in each segment to win that bet.":
    "Gana más hoyos en cada segmento para ganar esa apuesta.",
  "\"Press\" option: If losing by 2+ holes, you can start a new bet.":
    "Opción \"press\": si vas perdiendo por 2+ hoyos, puedes iniciar una nueva apuesta.",
  "Common format is \"2-2-2\" (same bet on each segment).":
    "Un formato común es \"2-2-2\" (misma apuesta en cada segmento).",
  "Each hole has a \"skin\" worth a set value.":
    "Cada hoyo tiene una \"skin\" con un valor fijo.",
  "The player with the lowest net score wins the skin.":
    "El jugador con el puntaje neto más bajo gana la skin.",
  "If two or more players tie, the skin carries over to the next hole.":
    "Si dos o más jugadores empatan, la skin se arrastra al siguiente hoyo.",
  "Carryovers can make later holes worth multiple skins.":
    "Los arrastres pueden hacer que los hoyos posteriores valgan varias skins.",
  "Unclaimed skins at the end are usually split or replayed.":
    "Las skins no reclamadas al final normalmente se reparten o se repiten.",

  // Config error screen
  "Configuration error": "Error de configuración",
  "This build is missing required configuration:":
    "A esta compilación le falta configuración requerida:",
};

function interpolate(template: string, params?: Record<string, string | number>) {
  if (!params) return template;
  return Object.keys(params).reduce((acc, key) => {
    return acc.replaceAll(`{{${key}}}`, String(params[key]));
  }, template);
}

export function translate(
  language: AppLanguage,
  key: string,
  params?: Record<string, string | number>
): string {
  const raw = language === "es" ? ES[key] ?? key : key;
  return interpolate(raw, params);
}

export function useT() {
  const language = useOnboardingStore((s) => s.language);
  return useCallback(
    (key: string, params?: Record<string, string | number>) =>
      translate(language, key, params),
    [language]
  );
}
