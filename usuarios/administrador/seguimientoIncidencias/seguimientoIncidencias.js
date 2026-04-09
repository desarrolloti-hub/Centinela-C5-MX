// seguimientoIncidencias.js - CONTROLADOR CON DRAG & DROP Y PASTE
// VERSIÓN COMPLETA CON MEJORAS Y DESCARGA DE PDF

import '/components/visualizadorImagen.js';

// =============================================
// VARIABLES GLOBALES
// =============================================
let incidenciaManager = null;
let usuarioActual = null;
let incidenciaActual = null;
let sucursalesMap = new Map();
let categoriasMap = new Map();
let evidenciasSeleccionadas = [];
let fechaIncidencia = null;
let fechaMinima = null;
let fechaMaxima = null;
let fechaUltimoSeguimiento = null;
let imageEditorModal = null;
let historialCollapsed = false;
let areas = [];
let areaManager = null;
let notificacionManager = null;

// Caché para datos relacionados
let areasCache = null;
let areasCacheOrg = null;
let areasCacheTimestamp = null;
let sucursalesCacheData = null;
let categoriasCacheData = null;
let datosCacheTimestamp = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

const LIMITES = {
    DESCRIPCION_SEGUIMIENTO: 500
};

// =============================================
// FUNCIÓN PARA CONVERTIR FECHAS
// =============================================
function convertirFechaFirestore(fecha) {
    if (!fecha) return null;

    if (fecha && typeof fecha === 'object' && 'seconds' in fecha) {
        return new Date(fecha.seconds * 1000);
    }

    try {
        const date = new Date(fecha);
        if (!isNaN(date.getTime())) {
            return date;
        }
    } catch (e) {
        console.error('Error convirtiendo fecha:', e);
    }

    return null;
}

// =============================================
// FUNCIÓN PARA COLLAPSIBLE
// =============================================
function configurarCollapsible() {
    const historialHeader = document.getElementById('historialHeader');
    const historialContent = document.getElementById('historialContent');
    const historialToggle = document.getElementById('historialToggle');

    if (!historialHeader || !historialContent || !historialToggle) return;

    historialHeader.addEventListener('click', () => {
        historialCollapsed = !historialCollapsed;

        if (historialCollapsed) {
            historialContent.style.display = 'none';
            historialToggle.style.transform = 'rotate(-90deg)';
        } else {
            historialContent.style.display = 'block';
            historialToggle.style.transform = 'rotate(0deg)';
        }
    });
}

// =============================================
// FUNCIONES DE CACHÉ
// =============================================
function limpiarCacheAreas() {
    areasCache = null;
    areasCacheOrg = null;
    areasCacheTimestamp = null;
  
}

function limpiarCacheDatos() {
    sucursalesCacheData = null;
    categoriasCacheData = null;
    datosCacheTimestamp = null;
  
}

function limpiarTodaCache() {
    limpiarCacheAreas();
    limpiarCacheDatos();
}

// =============================================
// MOSTRAR INDICADOR DE PASTE
// =============================================
function mostrarPasteIndicator() {
    let indicator = document.querySelector('.paste-indicator');
    if (indicator) indicator.remove();
    
    indicator = document.createElement('div');
    indicator.className = 'paste-indicator';
    indicator.innerHTML = '<i class="fas fa-paste"></i> Imagen pegada correctamente';
    document.body.appendChild(indicator);
    
    setTimeout(() => {
        if (indicator) indicator.remove();
    }, 2000);
}

// =============================================
// PROCESAR ARCHIVOS DE IMAGEN (UNIFICADO)
// =============================================
function procesarArchivosImagen(files) {
    if (!files || files.length === 0) return;

    const nuevosArchivos = Array.from(files);
    const maxSize = 5 * 1024 * 1024;
    const maxImages = 20;

    if (evidenciasSeleccionadas.length + nuevosArchivos.length > maxImages) {
        mostrarError(`Máximo ${maxImages} imágenes permitidas`);
        return;
    }

    const archivosValidos = nuevosArchivos.filter(file => {
        if (file.size > maxSize) {
            mostrarNotificacion(`La imagen ${file.name} excede 5MB`, 'warning');
            return false;
        }

        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
        if (!validTypes.includes(file.type)) {
            mostrarNotificacion(`Formato no válido: ${file.name}. Usa JPG, PNG, GIF o WEBP`, 'warning');
            return false;
        }

        return true;
    });

    archivosValidos.forEach(file => {
        evidenciasSeleccionadas.push({
            file: file,
            preview: URL.createObjectURL(file),
            comentario: '',
            elementos: [],
            edited: false
        });
    });

    actualizarVistaPreviaEvidencias();
}

// =============================================
// PROCESAR IMAGEN DESDE CLIPBOARD (Ctrl+V)
// =============================================
async function procesarImagenDesdeClipboard(items) {
    const imageItems = [];
    
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
            const file = item.getAsFile();
            if (file) imageItems.push(file);
        }
    }
    
    if (imageItems.length === 0) return false;
    
    procesarArchivosImagen(imageItems);
    mostrarPasteIndicator();
    return true;
}

// =============================================
// PROCESAR DRAG & DROP
// =============================================
function procesarDragAndDrop(files) {
    if (!files || files.length === 0) return;
    
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length === 0) {
        mostrarNotificacion('Solo se permiten imágenes', 'warning', 2000);
        return;
    }
    
    procesarArchivosImagen(imageFiles);
    mostrarNotificacion(`${imageFiles.length} imagen(es) agregadas`, 'success', 1500);
}

// =============================================
// CONFIGURAR DRAG & DROP Y PASTE
// =============================================
function configurarDragDropYPaste() {
    const uploadSection = document.querySelector('.image-upload-section');
    
    if (!uploadSection) return;
    
    // Drag & Drop
    uploadSection.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadSection.classList.add('drag-over');
    });
    
    uploadSection.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadSection.classList.remove('drag-over');
    });
    
    uploadSection.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadSection.classList.remove('drag-over');
        
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            procesarDragAndDrop(files);
        }
    });
    
    // Ctrl+V / Paste
    document.addEventListener('paste', async (e) => {
        const items = e.clipboardData.items;
        const processed = await procesarImagenDesdeClipboard(items);
        
        if (processed) {
            e.preventDefault();
        }
    });
    
   
}

// =============================================
// FUNCIÓN PARA DESCARGAR PDF
// =============================================
async function descargarPDF(pdfBlob, incidenciaId) {
    try {
        const url = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = url;
        
        const ahora = new Date();
        const fechaFormateada = ahora.toISOString().slice(0, 19).replace(/:/g, '-');
        link.download = `incidencia_${incidenciaId}_seguimiento_${fechaFormateada}.pdf`;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
  
        return true;
    } catch (error) {
        console.error('Error descargando PDF:', error);
        return false;
    }
}

// =============================================
// INICIALIZACIÓN OPTIMIZADA
// =============================================
async function inicializarSeguimiento() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const incidenciaId = urlParams.get('id');

        if (!incidenciaId) {
            throw new Error('No se especificó el ID de la incidencia');
        }

        cargarUsuario();

        if (!usuarioActual) {
            throw new Error('No se pudo cargar información del usuario');
        }

        await inicializarIncidenciaManager();
        
        // Cargar incidencia y datos en paralelo
        await Promise.all([
            cargarIncidencia(incidenciaId),
            cargarAreas(),
            cargarDatosRelacionados(),
            initNotificacionManager()
        ]);

        mostrarInfoIncidencia();
        mostrarEvidenciasOriginales();
        mostrarHistorialSeguimiento();
        configurarFechaSeguimiento();
        configurarEventos();
        inicializarValidaciones();
        configurarCollapsible();
        
        // Configurar Drag & Drop y Paste
        configurarDragDropYPaste();

        imageEditorModal = new window.ImageEditorModal();

    } catch (error) {
        console.error('Error inicializando:', error);
        mostrarError('Error al inicializar: ' + error.message);

        const container = document.querySelector('.custom-container');
        if (container) {
            container.innerHTML = `
                <div class="alert alert-danger" style="margin: 20px; padding: 20px;">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h4>Error al cargar la incidencia</h4>
                    <p>${error.message}</p>
                    <button class="btn-volver" onclick="window.location.href='../incidencias/incidencias.html'" style="margin-top: 15px;">
                        <i class="fas fa-arrow-left"></i> Volver a la lista
                    </button>
                </div>
            `;
        }
    }
}

async function inicializarIncidenciaManager() {
    try {
        const { IncidenciaManager } = await import('/clases/incidencia.js');
        incidenciaManager = new IncidenciaManager();
    } catch (error) {
        console.error('Error cargando IncidenciaManager:', error);
        throw error;
    }
}

async function initNotificacionManager() {
    if (!notificacionManager) {
        try {
            const { NotificacionAreaManager } = await import('/clases/notificacionArea.js');
            notificacionManager = new NotificacionAreaManager();
        } catch (error) {
            console.error('Error inicializando notificacionManager:', error);
        }
    }
    return notificacionManager;
}

async function cargarAreas(forceReload = false) {
    try {
        const now = Date.now();
        
        if (!forceReload && areasCache && areasCacheOrg === usuarioActual.organizacionCamelCase && 
            areasCacheTimestamp && (now - areasCacheTimestamp) < CACHE_TTL) {
            areas = areasCache;

            return areas;
        }
        
        const { AreaManager } = await import('/clases/area.js');
        areaManager = new AreaManager();

        if (usuarioActual && usuarioActual.organizacionCamelCase) {
            const areasObtenidas = await areaManager.getAreasByOrganizacion(
                usuarioActual.organizacionCamelCase,
                true
            );

            areas = areasObtenidas.filter(area => area.estado === 'activa');
            
            areasCache = areas;
            areasCacheOrg = usuarioActual.organizacionCamelCase;
            areasCacheTimestamp = now;
            
          
        }
        
        return areas;
    } catch (error) {
        console.error('Error cargando áreas:', error);
        areas = [];
        return areas;
    }
}

function cargarUsuario() {
    try {
        if (window.userManager && window.userManager.currentUser) {
            const user = window.userManager.currentUser;
            usuarioActual = {
                id: user.id || user.uid || `user_${Date.now()}`,
                uid: user.uid || user.id,
                nombreCompleto: user.nombreCompleto || user.nombre || 'Usuario',
                organizacion: user.organizacion || 'Sin organización',
                organizacionCamelCase: user.organizacionCamelCase || generarCamelCase(user.organizacion),
                correo: user.correo || user.email || ''
            };
            return;
        }

        const adminInfo = localStorage.getItem('adminInfo');
        if (adminInfo) {
            const adminData = JSON.parse(adminInfo);
            usuarioActual = {
                id: adminData.id || adminData.uid || `admin_${Date.now()}`,
                uid: adminData.uid || adminData.id,
                nombreCompleto: adminData.nombreCompleto || 'Administrador',
                organizacion: adminData.organizacion || 'Sin organización',
                organizacionCamelCase: adminData.organizacionCamelCase || generarCamelCase(adminData.organizacion),
                correo: adminData.correoElectronico || ''
            };
            return;
        }

        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        if (userData && Object.keys(userData).length > 0) {
            usuarioActual = {
                id: userData.uid || userData.id || `user_${Date.now()}`,
                uid: userData.uid || userData.id,
                nombreCompleto: userData.nombreCompleto || userData.nombre || 'Usuario',
                organizacion: userData.organizacion || userData.empresa || 'Sin organización',
                organizacionCamelCase: userData.organizacionCamelCase || generarCamelCase(userData.organizacion || userData.empresa),
                correo: userData.correo || userData.email || ''
            };
            return;
        }

        throw new Error('No hay sesión activa');

    } catch (error) {
        console.error('Error cargando usuario:', error);
        throw error;
    }
}

function generarCamelCase(texto) {
    if (!texto || typeof texto !== 'string') return 'sinOrganizacion';
    return texto
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+(.)/g, (match, chr) => chr.toUpperCase())
        .replace(/[^a-zA-Z0-9]/g, '');
}

async function cargarIncidencia(incidenciaId) {
    try {
        incidenciaActual = await incidenciaManager.getIncidenciaById(
            incidenciaId,
            usuarioActual.organizacionCamelCase
        );

        if (!incidenciaActual) {
            throw new Error('Incidencia no encontrada');
        }

        fechaIncidencia = convertirFechaFirestore(incidenciaActual.fechaInicio) || new Date();

        const seguimientos = incidenciaActual.getSeguimientosArray ?
            incidenciaActual.getSeguimientosArray() : [];

        if (seguimientos.length > 0) {
            fechaUltimoSeguimiento = convertirFechaFirestore(seguimientos[seguimientos.length - 1].fecha) || fechaIncidencia;
        } else {
            fechaUltimoSeguimiento = fechaIncidencia;
        }

        fechaMinima = fechaUltimoSeguimiento;
        fechaMaxima = new Date();

        document.getElementById('incidenciaId').textContent = incidenciaActual.id;

    } catch (error) {
        console.error('Error cargando incidencia:', error);
        throw error;
    }
}

async function cargarDatosRelacionados(forceReload = false) {
    try {
        const now = Date.now();
        
        if (!forceReload && sucursalesCacheData && categoriasCacheData && 
            datosCacheTimestamp && (now - datosCacheTimestamp) < CACHE_TTL) {
            sucursalesMap = sucursalesCacheData;
            categoriasMap = categoriasCacheData;
          
            return;
        }
        
        const { SucursalManager } = await import('/clases/sucursal.js');
        const sucursalManager = new SucursalManager();
        const sucursales = await sucursalManager.getSucursalesByOrganizacion(
            usuarioActual.organizacionCamelCase
        );

        const nuevaSucursalesMap = new Map();
        sucursales.forEach(suc => {
            nuevaSucursalesMap.set(suc.id, suc);
        });

        const { CategoriaManager } = await import('/clases/categoria.js');
        const categoriaManager = new CategoriaManager();
        const categorias = await categoriaManager.obtenerTodasCategorias();

        const nuevaCategoriasMap = new Map();
        categorias.forEach(cat => {
            nuevaCategoriasMap.set(cat.id, cat);
        });
        
        sucursalesMap = nuevaSucursalesMap;
        categoriasMap = nuevaCategoriasMap;
        
        sucursalesCacheData = nuevaSucursalesMap;
        categoriasCacheData = nuevaCategoriasMap;
        datosCacheTimestamp = now;
        
     

    } catch (error) {
        console.error('Error cargando datos relacionados:', error);
    }
}

// =============================================
// CONFIGURACIÓN DE FECHA
// =============================================
function configurarFechaSeguimiento() {
    const fechaInput = document.getElementById('fechaSeguimiento');
    if (!fechaInput) return;

    const ahora = new Date();

    const minDate = fechaMinima instanceof Date ? fechaMinima : new Date();
    const maxDate = fechaMaxima instanceof Date ? fechaMaxima : new Date();

    if (typeof flatpickr !== 'undefined') {
        flatpickr(fechaInput, {
            enableTime: true,
            dateFormat: "Y-m-d H:i",
            time_24hr: true,
            locale: "es",
            defaultDate: ahora,
            minuteIncrement: 1,
            minDate: minDate,
            maxDate: maxDate,
            onChange: (selectedDates) => {
                if (selectedDates.length > 0) {
                    validarFechaSeguimiento(selectedDates[0]);
                }
            }
        });
    } else {
        fechaInput.type = 'datetime-local';
        fechaInput.value = ahora.toISOString().slice(0, 16);
        fechaInput.min = minDate.toISOString().slice(0, 16);
        fechaInput.max = maxDate.toISOString().slice(0, 16);
    }

    const helpText = document.getElementById('rangoFechaHelp');
    if (helpText) {
        const fechaMin = formatearFechaParaHelp(minDate);
        const fechaMax = formatearFechaParaHelp(maxDate);
        helpText.innerHTML = `<i class="fas fa-info-circle"></i> Rango permitido: ${fechaMin} - ${fechaMax}`;
    }
}

function formatearFechaParaHelp(fecha) {
    if (!fecha) return 'No disponible';
    try {
        const date = fecha instanceof Date ? fecha : new Date(fecha);
        if (isNaN(date.getTime())) return 'Fecha inválida';

        return date.toLocaleDateString('es-MX', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return 'Fecha inválida';
    }
}

function validarFechaSeguimiento(fecha) {
    if (!fecha) return true;

    const minDate = fechaMinima instanceof Date ? fechaMinima : new Date(fechaMinima);
    const maxDate = fechaMaxima instanceof Date ? fechaMaxima : new Date();

    if (fecha < minDate) {
        mostrarError(`La fecha del seguimiento no puede ser anterior al último seguimiento (${formatearFechaCompacta(minDate)})`);
        return false;
    }

    if (fecha > maxDate) {
        mostrarError('La fecha del seguimiento no puede ser posterior a la fecha actual');
        return false;
    }

    return true;
}

// =============================================
// MOSTRAR INFORMACIÓN
// =============================================
function mostrarInfoIncidencia() {
    if (!incidenciaActual) return;

    document.getElementById('infoOrganizacion').textContent = usuarioActual.organizacion;

    const sucursal = sucursalesMap.get(incidenciaActual.sucursalId);
    document.getElementById('infoSucursal').textContent = sucursal ? sucursal.nombre : incidenciaActual.sucursalId;

    const categoria = categoriasMap.get(incidenciaActual.categoriaId);
    document.getElementById('infoCategoria').textContent = categoria ? categoria.nombre : incidenciaActual.categoriaId;

    let subcategoriaNombre = incidenciaActual.subcategoriaId || 'No especificada';
    if (incidenciaActual.subcategoriaId && categoria && categoria.subcategorias) {
        if (categoria.subcategorias instanceof Map) {
            const sub = categoria.subcategorias.get(incidenciaActual.subcategoriaId);
            if (sub) subcategoriaNombre = sub.nombre || incidenciaActual.subcategoriaId;
        } else if (typeof categoria.subcategorias === 'object') {
            const sub = categoria.subcategorias[incidenciaActual.subcategoriaId];
            if (sub) subcategoriaNombre = sub.nombre || incidenciaActual.subcategoriaId;
        }
    }
    document.getElementById('infoSubcategoria').textContent = subcategoriaNombre;

    const riesgoSpan = document.getElementById('infoRiesgo');
    const riesgoTexto = incidenciaActual.getNivelRiesgoTexto ?
        incidenciaActual.getNivelRiesgoTexto() : incidenciaActual.nivelRiesgo;
    const riesgoColor = incidenciaActual.getNivelRiesgoColor ?
        incidenciaActual.getNivelRiesgoColor() : obtenerRiesgoColor(incidenciaActual.nivelRiesgo);

    riesgoSpan.innerHTML = `<span class="riesgo-badge" style="background: ${riesgoColor}20; color: ${riesgoColor};">${riesgoTexto}</span>`;

    const estadoSpan = document.getElementById('infoEstado');
    const estadoTexto = incidenciaActual.getEstadoTexto ?
        incidenciaActual.getEstadoTexto() : incidenciaActual.estado;
    const estadoColor = incidenciaActual.getEstadoColor ?
        incidenciaActual.getEstadoColor() : (incidenciaActual.estado === 'finalizada' ? '#28a745' : '#ffc107');

    estadoSpan.innerHTML = `<span class="estado-badge" style="background: ${estadoColor}20; color: ${estadoColor};">${estadoTexto}</span>`;

    const estadoSelect = document.getElementById('estadoSeguimiento');
    if (estadoSelect) {
        estadoSelect.value = incidenciaActual.estado;
    }

    document.getElementById('infoFechaInicio').textContent = incidenciaActual.getFechaInicioFormateada ?
        incidenciaActual.getFechaInicioFormateada() : formatearFecha(incidenciaActual.fechaInicio);

    document.getElementById('infoReportadoPor').textContent = incidenciaActual.creadoPorNombre || 'No especificado';
    document.getElementById('infoDescripcion').textContent = incidenciaActual.detalles || 'Sin descripción';
}

function obtenerRiesgoColor(nivel) {
    const colores = {
        'bajo': '#28a745',
        'medio': '#ffc107',
        'alto': '#fd7e14',
        'critico': '#dc3545'
    };
    return colores[nivel] || '#28a745';
}

function formatearFecha(fecha) {
    if (!fecha) return 'No disponible';
    try {
        const date = convertirFechaFirestore(fecha);
        if (!date || isNaN(date.getTime())) return 'Fecha inválida';

        return date.toLocaleDateString('es-MX', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return 'Fecha inválida';
    }
}

function formatearFechaCompacta(fecha) {
    if (!fecha) return 'N/A';
    try {
        const date = convertirFechaFirestore(fecha);
        if (!date || isNaN(date.getTime())) return 'Fecha inválida';

        return date.toLocaleDateString('es-MX', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return 'Fecha inválida';
    }
}



// =============================================
// MOSTRAR EVIDENCIAS ORIGINALES (CON VISUALIZADOR GRUPAL)
// =============================================
function mostrarEvidenciasOriginales() {
    const container = document.getElementById('galeriaOriginal');
    const totalSpan = document.getElementById('totalImagenesOriginales');
    
    if (!container) return;

    const imagenes = incidenciaActual.imagenes || [];

    if (totalSpan) {
        totalSpan.textContent = `${imagenes.length} ${imagenes.length === 1 ? 'imagen' : 'imágenes'}`;
    }

    if (imagenes.length === 0) {
        container.innerHTML = `
            <div class="no-images">
                <i class="fas fa-images"></i>
                <p>No hay evidencias originales</p>
            </div>
        `;
        return;
    }

    // Preparar array de imágenes para el visualizador
    const imagenesData = imagenes.map(img => ({
        url: typeof img === 'string' ? img : img.url,
        comentario: (typeof img === 'object' && img.comentario) ? img.comentario : ''
    }));

    // Guardar globalmente para este grupo
    window._imagenesOriginalesSeguimiento = imagenesData;

    let html = '';
    imagenes.forEach((img, index) => {
        const url = typeof img === 'string' ? img : img.url;
        const comentario = (typeof img === 'object' && img.comentario) ? img.comentario : '';
        
        html += `
            <div class="gallery-item" onclick="window.visualizadorImagen.abrirDesdeDatos(window._imagenesOriginalesSeguimiento, ${index})">
                <img src="${url}" alt="Evidencia ${index + 1}" loading="lazy">
                <div class="gallery-overlay">
                    <button type="button" class="gallery-btn" onclick="event.stopPropagation(); window.visualizadorImagen.abrirDesdeDatos(window._imagenesOriginalesSeguimiento, ${index})">
                        <i class="fas fa-search-plus"></i>
                    </button>
                </div>
                ${comentario ? `<div class="image-comment"><i class="fas fa-comment"></i> ${escapeHTML(comentario.substring(0, 30))}${comentario.length > 30 ? '...' : ''}</div>` : ''}
            </div>
        `;
    });

    container.innerHTML = html;
}




// =============================================
// MOSTRAR HISTORIAL DE SEGUIMIENTO (CON VISUALIZADOR GRUPAL)
// =============================================
function mostrarHistorialSeguimiento() {
    const container = document.getElementById('timelineSeguimientos');
    const totalSpan = document.getElementById('totalSeguimientos');

    if (!container || !incidenciaActual) return;

    const seguimientos = incidenciaActual.getSeguimientosArray ?
        incidenciaActual.getSeguimientosArray() : [];

    if (totalSpan) {
        totalSpan.textContent = `${seguimientos.length} ${seguimientos.length === 1 ? 'seguimiento' : 'seguimientos'}`;
    }

    if (seguimientos.length === 0) {
        container.innerHTML = `
            <div class="timeline-empty">
                <i class="fas fa-clock"></i>
                <p>No hay seguimientos registrados</p>
            </div>
        `;
        return;
    }

    // Objeto global para almacenar imágenes de cada seguimiento
    if (!window._imagenesSeguimientosHistorial) window._imagenesSeguimientosHistorial = {};

    const seguimientosOrdenados = [...seguimientos].sort((a, b) => {
        const fechaA = a.fecha ? convertirFechaFirestore(a.fecha) : 0;
        const fechaB = b.fecha ? convertirFechaFirestore(b.fecha) : 0;
        return fechaA - fechaB;
    });

    let html = '<div class="timeline-simple">';

    seguimientosOrdenados.forEach((seg, index) => {
        const fecha = seg.fecha ? formatearFechaCompacta(seg.fecha) : 'Fecha no disponible';
        const evidencias = seg.evidencias || [];
        const idSeguimiento = seg.id || `SEG-${index + 1}`;
        
        // Preparar array de imágenes para este seguimiento específico
        const imagenesData = evidencias.map(ev => ({
            url: typeof ev === 'string' ? ev : ev.url,
            comentario: (typeof ev === 'object' && ev.comentario) ? ev.comentario : ''
        }));
        
        // Guardar en objeto global con clave única
        const claveImagenes = `seguimiento_${idSeguimiento}`;
        window._imagenesSeguimientosHistorial[claveImagenes] = imagenesData;

        html += `
            <div class="timeline-simple-item">
                <div class="timeline-simple-content">
                    <div class="timeline-simple-header">
                        <div class="timeline-simple-user">
                            <span class="timeline-simple-name">${escapeHTML(seg.usuarioNombre || 'Usuario')}</span>
                            <span class="timeline-simple-badge">${idSeguimiento}</span>
                        </div>
                        <div class="timeline-simple-date">
                            <i class="far fa-calendar-alt"></i>
                            <span>${fecha}</span>
                        </div>
                    </div>
                    
                    <div class="timeline-simple-description">
                        ${escapeHTML(seg.descripcion || 'Sin descripción')}
                    </div>
        `;

        if (evidencias.length > 0) {
            html += `
                    <div class="timeline-simple-evidencias">
                        <div class="timeline-simple-evidencias-header">
                            <i class="fas fa-images"></i>
                            <span>${evidencias.length} ${evidencias.length === 1 ? 'evidencia' : 'evidencias'}</span>
                        </div>
                        <div class="timeline-simple-evidencias-grid">
            `;

            evidencias.forEach((ev, evIndex) => {
                const url = typeof ev === 'string' ? ev : ev.url;
                const comentario = (typeof ev === 'object' && ev.comentario) ? ev.comentario : '';

                html += `
                            <div class="timeline-simple-evidencia" onclick="window.visualizadorImagen.abrirDesdeDatos(window._imagenesSeguimientosHistorial['${claveImagenes}'], ${evIndex})">
                                <div style="position: relative;">
                                    <img src="${url}" alt="Evidencia ${evIndex + 1}" loading="lazy">
                                    <div class="timeline-evidencia-overlay">
                                        <i class="fas fa-search-plus"></i>
                                    </div>
                                </div>
                                ${comentario ? `<div class="timeline-simple-evidencia-comentario" title="${escapeHTML(comentario)}">${escapeHTML(comentario.substring(0, 30))}${comentario.length > 30 ? '...' : ''}</div>` : ''}
                            </div>
                `;
            });

            html += `
                        </div>
                    </div>
            `;
        }

        html += `
                </div>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
}

// =============================================
// CONFIGURACIÓN DE EVENTOS
// =============================================
function configurarEventos() {
    try {
        document.getElementById('btnVolverLista')?.addEventListener('click', () => volverALista());
        document.getElementById('btnCancelar')?.addEventListener('click', () => cancelar());

        document.getElementById('btnGuardarSeguimiento')?.addEventListener('click', (e) => {
            e.preventDefault();
            validarYGuardar();
        });

        document.getElementById('btnAgregarEvidencias')?.addEventListener('click', () => {
            document.getElementById('inputEvidencias').click();
        });

        document.getElementById('inputEvidencias')?.addEventListener('change', (e) => procesarArchivosImagen(e.target.files));

        document.getElementById('formSeguimiento')?.addEventListener('submit', (e) => {
            e.preventDefault();
            validarYGuardar();
        });

    } catch (error) {
        console.error('Error configurando eventos:', error);
    }
}

// =============================================
// EVIDENCIAS
// =============================================
function actualizarVistaPreviaEvidencias() {
    const container = document.getElementById('evidenciasPreview');
    const containerParent = document.getElementById('evidenciasPreviewContainer');
    const countSpan = document.getElementById('evidenciasCount');

    if (!container) return;

    if (evidenciasSeleccionadas.length === 0) {
        if (containerParent) containerParent.style.display = 'none';
        return;
    }

    if (containerParent) containerParent.style.display = 'block';

    if (countSpan) {
        countSpan.textContent = evidenciasSeleccionadas.length;
    }

    let html = '';
    evidenciasSeleccionadas.forEach((img, index) => {
        html += `
            <div class="preview-item">
                <img src="${img.preview}" alt="Preview ${index + 1}">
                <div class="preview-overlay">
                    <button type="button" class="preview-btn edit-btn" data-index="${index}" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button type="button" class="preview-btn delete-btn" data-index="${index}" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                    ${img.edited ? '<span class="edited-badge"><i class="fas fa-check"></i> Editada</span>' : ''}
                </div>
                ${img.comentario ? `<div class="image-comment"><i class="fas fa-comment"></i> ${escapeHTML(img.comentario.substring(0, 25))}${img.comentario.length > 25 ? '...' : ''}</div>` : ''}
            </div>
        `;
    });

    container.innerHTML = html;

    container.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = e.currentTarget.dataset.index;
            editarEvidencia(parseInt(index));
        });
    });

    container.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = e.currentTarget.dataset.index;
            eliminarEvidencia(parseInt(index));
        });
    });
}

function editarEvidencia(index) {
    if (imageEditorModal && evidenciasSeleccionadas[index]) {
        const img = evidenciasSeleccionadas[index];
        imageEditorModal.show(
            img.file,
            index,
            img.comentario,
            (savedIndex, editedFile, comentario, elementos) => {
                evidenciasSeleccionadas[savedIndex].file = editedFile;
                evidenciasSeleccionadas[savedIndex].comentario = comentario;
                evidenciasSeleccionadas[savedIndex].elementos = elementos;
                evidenciasSeleccionadas[savedIndex].edited = true;

                if (evidenciasSeleccionadas[savedIndex].preview) {
                    URL.revokeObjectURL(evidenciasSeleccionadas[savedIndex].preview);
                }
                evidenciasSeleccionadas[savedIndex].preview = URL.createObjectURL(editedFile);

                actualizarVistaPreviaEvidencias();
            }
        );
    }
}

function eliminarEvidencia(index) {
    if (evidenciasSeleccionadas[index]?.preview) {
        URL.revokeObjectURL(evidenciasSeleccionadas[index].preview);
    }
    evidenciasSeleccionadas.splice(index, 1);
    actualizarVistaPreviaEvidencias();
}

// =============================================
// VALIDACIONES
// =============================================
function inicializarValidaciones() {
    const descripcionInput = document.getElementById('descripcionSeguimiento');
    if (descripcionInput) {
        descripcionInput.maxLength = LIMITES.DESCRIPCION_SEGUIMIENTO;
        descripcionInput.addEventListener('input', () => {
            validarLongitudCampo(
                descripcionInput,
                LIMITES.DESCRIPCION_SEGUIMIENTO,
                'La descripción'
            );
            actualizarContador('descripcionSeguimiento', 'contadorCaracteres', LIMITES.DESCRIPCION_SEGUIMIENTO);
        });
    }

    actualizarContador('descripcionSeguimiento', 'contadorCaracteres', LIMITES.DESCRIPCION_SEGUIMIENTO);
}

function actualizarContador(inputId, counterId, limite) {
    const input = document.getElementById(inputId);
    const counter = document.getElementById(counterId);

    if (input && counter) {
        const longitud = input.value.length;
        counter.textContent = `${longitud}/${limite}`;

        if (longitud > limite * 0.9) {
            counter.style.color = 'var(--color-warning)';
        } else if (longitud > limite * 0.95) {
            counter.style.color = 'var(--color-danger)';
        } else {
            counter.style.color = 'var(--color-accent-primary)';
        }
    }
}

function validarLongitudCampo(campo, limite, nombreCampo) {
    const longitud = campo.value.length;
    if (longitud > limite) {
        campo.value = campo.value.substring(0, limite);
        mostrarNotificacion(`${nombreCampo} no puede exceder ${limite} caracteres`, 'warning', 3000);
    }
}

function validarYGuardar() {
    const fechaInput = document.getElementById('fechaSeguimiento');
    let fechaHora = fechaInput.value;

    if (!fechaHora) {
        mostrarError('Debe seleccionar fecha y hora');
        fechaInput.focus();
        return;
    }

    let fechaObj;
    if (typeof fechaHora === 'string') {
        fechaObj = new Date(fechaHora);
    } else {
        fechaObj = fechaHora;
    }

    if (!validarFechaSeguimiento(fechaObj)) {
        return;
    }

    const descripcionInput = document.getElementById('descripcionSeguimiento');
    const descripcion = descripcionInput.value.trim();
    if (!descripcion) {
        descripcionInput.classList.add('is-invalid');
        mostrarError('La descripción del seguimiento es obligatoria');
        descripcionInput.focus();
        return;
    }
    if (descripcion.length < 5) {
        descripcionInput.classList.add('is-invalid');
        mostrarError('La descripción debe tener al menos 5 caracteres');
        descripcionInput.focus();
        return;
    }
    if (descripcion.length > LIMITES.DESCRIPCION_SEGUIMIENTO) {
        descripcionInput.classList.add('is-invalid');
        mostrarError(`La descripción no puede exceder ${LIMITES.DESCRIPCION_SEGUIMIENTO} caracteres`);
        descripcionInput.focus();
        return;
    }
    descripcionInput.classList.remove('is-invalid');

    const estadoSelect = document.getElementById('estadoSeguimiento');
    const nuevoEstado = estadoSelect.value;
    if (!nuevoEstado) {
        mostrarError('Debe seleccionar un estado');
        estadoSelect.focus();
        return;
    }

    confirmarYGuardar({
        fecha: fechaObj,
        descripcion,
        nuevoEstado,
        evidencias: evidenciasSeleccionadas
    });
}

// =============================================
// CONFIRMAR Y GUARDAR (SweetAlert MEJORADA)
// =============================================
async function confirmarYGuardar(datos) {
    const estadoAnterior = incidenciaActual.estado;
    const estadoTexto = {
        'pendiente': 'Pendiente',
        'finalizada': 'Finalizada'
    }[datos.nuevoEstado] || datos.nuevoEstado;

    const confirmResult = await Swal.fire({
        title: 'Confirmar seguimiento',
        html: `
            <div style="text-align: left;">
                <p><strong><i class="fas fa-calendar-alt"></i> Fecha:</strong> ${formatearFecha(datos.fecha)}</p>
                <p><strong><i class="fas fa-check-circle"></i> Estado:</strong> 
                    <span style="color: ${estadoAnterior === datos.nuevoEstado ? 'var(--color-warning)' : 'var(--color-success)'};">
                        ${estadoTexto}
                    </span>
                </p>
                <p><strong><i class="fas fa-images"></i> Evidencias:</strong> ${datos.evidencias.length} imagen(es)</p>
                <p><strong><i class="fas fa-align-left"></i> Descripción:</strong><br>
                    <span style="color: var(--color-text-secondary); font-size: 13px;">${escapeHTML(datos.descripcion.substring(0, 200))}${datos.descripcion.length > 200 ? '...' : ''}</span>
                </p>
            </div>
        `,
        icon: 'question',
        showCancelButton: true,
        showDenyButton: false,
        confirmButtonText: '<i class="fas fa-save"></i> GUARDAR SEGUIMIENTO',
        cancelButtonText: '<i class="fas fa-times"></i> CANCELAR',
        confirmButtonColor: '#28a745',
        cancelButtonColor: '#6c757d'
    });

    if (confirmResult.isConfirmed) {
        await guardarSeguimiento(datos);
    }
}

// =============================================
// FUNCIONES DE CANALIZACIÓN
// =============================================
async function _canalizarAreas(incidenciaId, incidenciaTitulo = '') {
    let continuar = true;
    let areasCanalizadas = [];

    while (continuar) {
        const inputOptions = {};
        areas.forEach(area => {
            if (!areasCanalizadas.some(a => a.id === area.id)) {
                inputOptions[area.id] = area.nombreArea;
            }
        });

        if (Object.keys(inputOptions).length === 0) {
            if (areasCanalizadas.length > 0) {
                await Swal.fire({
                    icon: 'info',
                    title: 'No hay más áreas',
                    text: 'Todas las áreas disponibles ya han sido canalizadas',
                    timer: 1500,
                    showConfirmButton: false
                });
            }
            continuar = false;
            break;
        }

        const { value: areaId, isConfirmed } = await Swal.fire({
            title: areasCanalizadas.length === 0 ? '¿Canalizar a un área?' : 'Canalizar a otra área',
            text: areasCanalizadas.length === 0
                ? 'Selecciona el área a la que deseas canalizar esta incidencia'
                : `Áreas actuales: ${areasCanalizadas.map(a => a.nombre).join(', ')}`,
            input: 'select',
            inputOptions: inputOptions,
            inputPlaceholder: 'Selecciona un área',
            showCancelButton: true,
            confirmButtonText: 'CANALIZAR',
            cancelButtonText: areasCanalizadas.length === 0 ? 'NO CANALIZAR' : 'FINALIZAR',
            confirmButtonColor: '#28a745',
            inputValidator: (value) => {
                if (!value) {
                    return 'Debes seleccionar un área';
                }
            }
        });

        if (!isConfirmed) {
            continuar = false;
            break;
        }

        if (areaId) {
            const area = areas.find(a => a.id === areaId);
            if (area) {
                areasCanalizadas.push({
                    id: area.id,
                    nombre: area.nombreArea
                });

                try {
                    const resultado = await incidenciaManager.agregarCanalizacion(
                        incidenciaId,
                        area.id,
                        area.nombreArea,
                        usuarioActual.id,
                        usuarioActual.nombreCompleto,
                        'Canalización desde seguimiento',
                        usuarioActual.organizacionCamelCase
                    );

                    if (resultado && resultado.success) {
                        await Swal.fire({
                            icon: 'success',
                            title: 'Área agregada',
                            text: `La incidencia ha sido canalizada a ${area.nombreArea}`,
                            timer: 1500,
                            showConfirmButton: false
                        });
                    } else {
                        throw new Error(resultado?.message || 'Error al guardar canalización');
                    }

                } catch (error) {
                    console.error('Error guardando canalización:', error);
                    await Swal.fire({
                        icon: 'error',
                        title: 'Error',
                        text: error.message || 'No se pudo canalizar a esta área'
                    });
                }
            }
        }
    }

    if (areasCanalizadas.length > 0) {
        await _enviarNotificacionesCanalizacion(areasCanalizadas, incidenciaId, incidenciaTitulo);
        limpiarCacheAreas();
    }

    return areasCanalizadas;
}

async function _enviarNotificacionesCanalizacion(areas, incidenciaId, incidenciaTitulo) {
    try {
        if (!notificacionManager) {
            await initNotificacionManager();
        }

        if (!notificacionManager) {
            console.error('No se pudo inicializar notificacionManager');
            return;
        }

        const sucursalNombre = sucursalesMap.get(incidenciaActual.sucursalId)?.nombre || '';
        const categoriaNombre = categoriasMap.get(incidenciaActual.categoriaId)?.nombre || '';
        
        const areasFormateadas = areas.map(area => ({
            id: area.id,
            nombre: area.nombre
        }));

        const resultado = await notificacionManager.notificarMultiplesAreas({
            areas: areasFormateadas,
            incidenciaId: incidenciaId,
            incidenciaTitulo: incidenciaTitulo || incidenciaActual.getTitulo?.() || 'Incidencia',
            sucursalId: incidenciaActual.sucursalId || '',
            sucursalNombre: sucursalNombre,
            categoriaId: incidenciaActual.categoriaId || '',
            categoriaNombre: categoriaNombre,
            nivelRiesgo: incidenciaActual.nivelRiesgo || 'medio',
            tipo: 'canalizacion',
            prioridad: incidenciaActual.nivelRiesgo === 'critico' ? 'urgente' : 'normal',
            remitenteId: usuarioActual.id,
            remitenteNombre: usuarioActual.nombreCompleto,
            organizacionCamelCase: usuarioActual.organizacionCamelCase,
            enviarPush: true
        });

        Swal.close();

        if (resultado.success) {
            let mensaje = ` Notificaciones enviadas:`;
            mensaje += `<br> ${resultado.totalColaboradores} colaboradores notificados`;
            mensaje += `<br> ${resultado.totalAdministradores} administradores notificados`;
            
            if (resultado.push && resultado.push.enviados > 0) {
                mensaje += `<br> Push: ${resultado.push.enviados}/${resultado.push.total} enviados`;
            }
            
         
            
            await Swal.fire({
                icon: 'success',
                title: 'Notificaciones enviadas',
                html: mensaje,
                timer: 3000,
                showConfirmButton: false
            });
        } else {
            console.error(' Error al enviar notificaciones:', resultado.error);
        }

    } catch (error) {
        console.error('Error en _enviarNotificacionesCanalizacion:', error);
        Swal.close();
    }
}

// =============================================
// GUARDAR SEGUIMIENTO CON DESCARGA DE PDF
// =============================================
async function guardarSeguimiento(datos) {
    const btnGuardar = document.getElementById('btnGuardarSeguimiento');
    const originalHTML = btnGuardar ? btnGuardar.innerHTML : '<i class="fas fa-save me-2"></i>Guardar Seguimiento';

    try {
        if (btnGuardar) {
            btnGuardar.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Guardando...';
            btnGuardar.disabled = true;
        }

        Swal.fire({
            title: 'Guardando seguimiento...',
            text: 'Por favor espere, esto puede tomar unos segundos.',
            allowOutsideClick: false,
            allowEscapeKey: false,
            showConfirmButton: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        const archivos = datos.evidencias.map(ev => ev.file);

        await incidenciaManager.agregarSeguimiento(
            incidenciaActual.id,
            usuarioActual.id,
            usuarioActual.nombreCompleto,
            datos.descripcion,
            archivos,
            usuarioActual.organizacionCamelCase,
            datos.evidencias,
            datos.fecha,
            usuarioActual
        );

        if (datos.nuevoEstado !== incidenciaActual.estado) {
            await incidenciaManager.actualizarIncidencia(
                incidenciaActual.id,
                { estado: datos.nuevoEstado },
                usuarioActual.id,
                usuarioActual.organizacionCamelCase,
                usuarioActual
            );
        }

        evidenciasSeleccionadas.forEach(ev => {
            if (ev.preview) URL.revokeObjectURL(ev.preview);
        });
        evidenciasSeleccionadas = [];

        await cargarIncidencia(incidenciaActual.id);

        // Generar PDF y descargarlo automáticamente
        const pdfBlob = await _generarYSubirPDF();

        // Descargar PDF automáticamente si se generó correctamente
        if (pdfBlob && pdfBlob.size > 0) {
            await descargarPDF(pdfBlob, incidenciaActual.id);
        }

        Swal.close();

        const quiereCanalizar = await Swal.fire({
            icon: 'question',
            title: '¿Canalizar esta incidencia?',
            text: '¿Deseas canalizar esta incidencia a alguna área?',
            showCancelButton: true,
            confirmButtonText: 'SÍ, CANALIZAR',
            cancelButtonText: 'NO, FINALIZAR',
            confirmButtonColor: '#28a745'
        });

        let areasCanalizadas = [];

        if (quiereCanalizar.isConfirmed) {
            areasCanalizadas = await _canalizarAreas(incidenciaActual.id, datos.descripcion.substring(0, 50));
        }

        const totalCanalizaciones = areasCanalizadas.length;
        const mensajeCanalizacion = totalCanalizaciones > 0
            ? `Canalizada a ${totalCanalizaciones} ${totalCanalizaciones === 1 ? 'área' : 'áreas'}.`
            : 'No se canalizó a ninguna área.';

        mostrarInfoIncidencia();
        mostrarEvidenciasOriginales();
        mostrarHistorialSeguimiento();

        document.getElementById('descripcionSeguimiento').value = '';
        actualizarContador('descripcionSeguimiento', 'contadorCaracteres', LIMITES.DESCRIPCION_SEGUIMIENTO);
        configurarFechaSeguimiento();

        const previewContainer = document.getElementById('evidenciasPreviewContainer');
        if (previewContainer) previewContainer.style.display = 'none';
        const evidenciasPreview = document.getElementById('evidenciasPreview');
        if (evidenciasPreview) evidenciasPreview.innerHTML = '';

        await Swal.fire({
            icon: 'success',
            title: '¡Seguimiento guardado!',
          
            confirmButtonText: 'Aceptar',
            confirmButtonColor: '#28a745'
        });

    } catch (error) {
        console.error('Error guardando seguimiento:', error);
        Swal.close();
        mostrarError(error.message || 'No se pudo guardar el seguimiento');
    } finally {
        if (btnGuardar) {
            btnGuardar.innerHTML = originalHTML;
            btnGuardar.disabled = false;
        }
        ocultarCargando();
    }
}

async function _generarYSubirPDF() {
    try {
        
        
        const incidenciaActualizada = await incidenciaManager.getIncidenciaById(
            incidenciaActual.id,
            usuarioActual.organizacionCamelCase
        );
        
        if (!incidenciaActualizada) {
            throw new Error('No se pudo recargar la incidencia');
        }
        
        incidenciaActual = incidenciaActualizada;
        
        const sucursalesArray = Array.from(sucursalesMap.values());
        const categoriasArray = Array.from(categoriasMap.values());
        
        const { generadorIPHSeguimiento } = await import('/components/iph-generator-seguimiento.js');
        
        generadorIPHSeguimiento.configurar({
            organizacionActual: {
                nombre: usuarioActual.organizacion,
                camelCase: usuarioActual.organizacionCamelCase
            },
            sucursalesCache: sucursalesArray,
            categoriasCache: categoriasArray,
            usuariosCache: [usuarioActual]
        });
        
        const pdfBlob = await generadorIPHSeguimiento.generarIPHSeguimiento(incidenciaActual, {
            mostrarAlerta: false,
            returnBlob: true
        });
        
        if (!pdfBlob || pdfBlob.size === 0) {
            throw new Error('El PDF generado está vacío');
        }
        
      
        
        const pdfFile = new File([pdfBlob], `incidencia_${incidenciaActual.id}.pdf`, { type: 'application/pdf' });
        const rutaPDF = incidenciaActual.getRutaPDF();
        
        const resultado = await incidenciaManager.subirArchivo(pdfFile, rutaPDF);
        
        await incidenciaManager.actualizarIncidencia(
            incidenciaActual.id,
            { pdfUrl: resultado.url },
            usuarioActual.id,
            usuarioActual.organizacionCamelCase,
            usuarioActual
        );
        
        incidenciaActual.pdfUrl = resultado.url;
        
    
        
        // Devolver el blob para la descarga automática
        return pdfBlob;
        
    } catch (error) {
        console.error('❌ Error actualizando PDF:', error);
        return null;
    }
}

// =============================================
// NAVEGACIÓN
// =============================================
function volverALista() {
    window.location.href = '../incidencias/incidencias.html';
}

function cancelar() {
    Swal.fire({
        title: '¿Cancelar?',
        text: 'Los cambios no guardados se perderán',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, cancelar',
        cancelButtonText: 'No, continuar'
    }).then((result) => {
        if (result.isConfirmed) {
            volverALista();
        }
    });
}

// =============================================
// UTILIDADES
// =============================================
function escapeHTML(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function mostrarError(mensaje) {
    mostrarNotificacion(mensaje, 'error');
}

function mostrarNotificacion(mensaje, tipo = 'info', duracion = 5000) {
    Swal.fire({
        title: tipo === 'success' ? 'Éxito' :
            tipo === 'error' ? 'Error' :
                tipo === 'warning' ? 'Advertencia' : 'Información',
        text: mensaje,
        icon: tipo,
        timer: duracion,
        timerProgressBar: true,
        showConfirmButton: false
    });
}

function mostrarCargando(mensaje = 'Guardando...') {
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'loadingOverlay';
    overlay.innerHTML = `
        <div class="spinner"></div>
        <div class="loading-text">${mensaje}</div>
    `;
    document.body.appendChild(overlay);
}

function ocultarCargando() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.remove();
    }
}

// =============================================
// INICIALIZACIÓN
// =============================================
document.addEventListener('DOMContentLoaded', function () {
    inicializarSeguimiento();
});