// verIncidencias.js - VERSIÓN MODIFICADA CON VISUALIZADORES
// Muestra los detalles de la incidencia usando modales para imágenes y PDF

import '/components/visualizadorImagen.js';
import '/components/visualizadorPDF.js';

// =============================================
// VARIABLES GLOBALES
// =============================================
let incidenciaManager = null;
let usuarioActual = null;
let incidenciaActual = null;
let sucursalesMap = new Map();
let categoriasMap = new Map();

const LIMITES = {
    DETALLES_INCIDENCIA: 1000
};

// =============================================
// FUNCIÓN PARA CONVERTIR FECHAS DE FIRESTORE
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
// INICIALIZACIÓN
// =============================================
async function inicializarVerIncidencia() {
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
        await cargarIncidencia(incidenciaId);
        await cargarDatosRelacionados();
        
        mostrarInfoIncidencia();
        mostrarEvidenciasOriginales();
        mostrarHistorialSeguimiento();
        mostrarPDF();
        configurarEventos();

        await registrarLecturaIncidencia();


    } catch (error) {
        console.error('Error inicializando:', error);
        mostrarError('Error al cargar la incidencia: ' + error.message);
        
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

function mostrarPDF() {
    const pdfContainer = document.getElementById('pdfContainer');
    if (!pdfContainer || !incidenciaActual) return;

    if (incidenciaActual.pdfUrl) {
        pdfContainer.innerHTML = `
            <button class="btn-pdf" onclick="window.visualizadorPDF.abrir('${incidenciaActual.pdfUrl}', 'Incidencia ${incidenciaActual.id}')">
                <i class="fas fa-file-pdf"></i> Ver PDF de Incidencia
            </button>
        `;
        pdfContainer.style.display = 'block';
    } else {
        pdfContainer.style.display = 'none';
    }
}

async function registrarLecturaIncidencia() {
    try {
        if (!incidenciaManager) return;
        
        const historial = await incidenciaManager._getHistorialManager();
        if (historial && usuarioActual && incidenciaActual) {
            
            const sucursal = sucursalesMap.get(incidenciaActual.sucursalId);
            const categoria = categoriasMap.get(incidenciaActual.categoriaId);
            
            const sucursalNombre = sucursal ? sucursal.nombre : 'desconocida';
            const categoriaNombre = categoria ? categoria.nombre : 'desconocida';
            
            await historial.registrarActividad({
                usuario: usuarioActual,
                tipo: 'leer',
                modulo: 'incidencias',
                descripcion: `Consultó detalles de incidencia ${incidenciaActual.id} - ${categoriaNombre} en ${sucursalNombre}`,
                detalles: {
                    incidenciaId: incidenciaActual.id,
                    sucursalId: incidenciaActual.sucursalId,
                    sucursalNombre: sucursalNombre,
                    categoriaId: incidenciaActual.categoriaId,
                    categoriaNombre: categoriaNombre,
                    nivelRiesgo: incidenciaActual.nivelRiesgo,
                    estado: incidenciaActual.estado
                }
            });
        }
    } catch (error) {
        console.error('Error registrando lectura de incidencia:', error);
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

        document.getElementById('incidenciaId').textContent = incidenciaActual.id;

    } catch (error) {
        console.error('Error cargando incidencia:', error);
        throw error;
    }
}

async function cargarDatosRelacionados() {
    try {
        const { SucursalManager } = await import('/clases/sucursal.js');
        const sucursalManager = new SucursalManager();
        const sucursales = await sucursalManager.getSucursalesByOrganizacion(
            usuarioActual.organizacionCamelCase
        );
        
        sucursales.forEach(suc => {
            sucursalesMap.set(suc.id, suc);
        });

        const { CategoriaManager } = await import('/clases/categoria.js');
        const categoriaManager = new CategoriaManager();
        const categorias = await categoriaManager.obtenerTodasCategorias();
        
        categorias.forEach(cat => {
            categoriasMap.set(cat.id, cat);
        });

    } catch (error) {
        console.error('Error cargando datos relacionados:', error);
    }
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

    document.getElementById('infoFechaInicio').textContent = incidenciaActual.getFechaInicioFormateada ?
        incidenciaActual.getFechaInicioFormateada() : formatearFecha(incidenciaActual.fechaInicio);

    if (incidenciaActual.fechaFinalizacion) {
        const fechaFinSpan = document.getElementById('infoFechaFinalizacion');
        if (fechaFinSpan) {
            fechaFinSpan.innerHTML = `<span class="info-value">${incidenciaActual.getFechaFinalizacionFormateada()}</span>`;
            document.getElementById('fechaFinalizacionContainer').style.display = 'block';
        }
    }

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
        const date = fecha instanceof Date ? fecha : new Date(fecha);
        if (isNaN(date.getTime())) return 'Fecha inválida';
        
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
        if (fecha && typeof fecha === 'object' && 'seconds' in fecha) {
            const date = new Date(fecha.seconds * 1000);
            return date.toLocaleDateString('es-MX', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
        
        const date = fecha instanceof Date ? fecha : new Date(fecha);
        if (isNaN(date.getTime())) return 'Fecha inválida';
        
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
// MOSTRAR EVIDENCIAS ORIGINALES (MODIFICADO - IMAGEN COMPLETA CLICKEABLE + LUPA)
// =============================================
// =============================================
// MOSTRAR EVIDENCIAS ORIGINALES (CORREGIDO)
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

    // Guardar los datos globalmente para este grupo
    window._imagenesOriginales = imagenesData;

    let html = '';
    imagenes.forEach((img, index) => {
        const url = typeof img === 'string' ? img : img.url;
        const comentario = (typeof img === 'object' && img.comentario) ? img.comentario : '';
        
        html += `
            <div class="gallery-item" data-index="${index}" data-url="${url}" data-comentario="${escapeHTML(comentario)}" data-grupo="original" onclick="window.visualizadorImagen.abrirDesdeDatos(window._imagenesOriginales, ${index})">
                <img src="${url}" alt="Evidencia ${index + 1}" loading="lazy">
                <div class="gallery-overlay">
                    <button type="button" class="gallery-btn" onclick="event.stopPropagation(); window.visualizadorImagen.abrirDesdeDatos(window._imagenesOriginales, ${index})">
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
// MOSTRAR HISTORIAL DE SEGUIMIENTO (CORREGIDO)
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

    // Objeto global para almacenar las imágenes de cada seguimiento
    if (!window._imagenesSeguimientos) window._imagenesSeguimientos = {};

    let html = '<div class="timeline-simple">';
    seguimientos.forEach((seg, index) => {
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
        window._imagenesSeguimientos[claveImagenes] = imagenesData;
        
        html += `
            <div class="timeline-simple-item">
                <div class="timeline-simple-marker"></div>
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
                            <div class="timeline-simple-evidencia" onclick="window.visualizadorImagen.abrirDesdeDatos(window._imagenesSeguimientos['${claveImagenes}'], ${evIndex})">
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

    } catch (error) {
        console.error('Error configurando eventos:', error);
    }
}

// =============================================
// NAVEGACIÓN
// =============================================
function volverALista() {
    window.location.href = '../incidencias/incidencias.html';
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

function mostrarCargando(mensaje = 'Cargando...') {
    Swal.fire({
        title: mensaje,
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });
}

function ocultarCargando() {
    Swal.close();
}

// =============================================
// INICIALIZACIÓN
// =============================================
document.addEventListener('DOMContentLoaded', function () {
    inicializarVerIncidencia();
});