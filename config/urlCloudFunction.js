// CONFIGURACIÓN DE CLOUD FUNCTIONS
// =================================

// URL base de las Cloud Functions
const CLOUD_FUNCTION_BASE_URL = "https://us-central1-centinela-c5.cloudfunctions.net/";

// Acciones disponibles
const ACTIONS = {
    SOLICITAR_CODIGO: 'solicitarCodigo',
    COMPLETAR_REGISTRO: 'completarRegistro',
    ESTABLECER_CONTRASENA: 'establecerContraseña',
    AUTENTICAR: 'autenticar',
    LISTAR_PANELES: 'listarPaneles',
    VINCULAR_PANEL: 'vincularPanel',
    RENAME_PANEL: 'renamePanel',
    LOGIN_PANEL: 'loginPanel',
    OBTENER_ESTADO_PANEL: 'obtenerEstadoPanel',
    LISTAR_ZONAS: 'listarZonas',
    LISTAR_EVENTOS: 'listarEventos',
    LISTAR_DISPOSITIVOS: 'listarDispositivos',
    SET_ESTADO_PANEL: 'setEstadoPanel',
    VERIFICAR_SESION: 'verificarSesion'
};

// Exportar configuración
export { CLOUD_FUNCTION_BASE_URL, ACTIONS };