// incidencias.js - CONTROLADOR
// NO IMPORTA FIRESTORE DIRECTAMENTE

import { generadorIPH } from '/components/iph-generator.js';
import '/components/visualizadorPDF.js';
import { IncidenciaManager } from '/clases/incidencia.js';

// =============================================
// VARIABLES GLOBALES
// =============================================
let incidenciaManager = null;
let organizacionActual = null;
let sucursalesCache = [];
let categoriasCache = [];
let subcategoriasCache = [];
let usuariosCache = [];

// Configuración de paginación REAL
const ITEMS_POR_PAGINA = 10;
let paginaActual = 1;
let totalIncidencias = 0;
let totalPaginas = 0;
let incidenciasActuales = [];
let cursoresPaginacion = {
    ultimoDocumento: null,
    primerDocumento: null
};

// Filtros activos
let filtrosActivos = {
    estado: 'todos',
    nivelRiesgo: 'todos',
    sucursalId: 'todos'
};

// =============================================
// FUNCIÓN PARA OBTENER USUARIO ACTUAL
// =============================================
function obtenerUsuarioActual() {
    try {
        const adminInfo = localStorage.getItem('adminInfo');
        if (adminInfo) {
            const adminData = JSON.parse(adminInfo);
            return {
                id: adminData.id || adminData.uid,
                uid: adminData.uid || adminData.id,
                nombreCompleto: adminData.nombreCompleto || 'Administrador',
                organizacion: adminData.organizacion,
                organizacionCamelCase: adminData.organizacionCamelCase,
                correo: adminData.correoElectronico || '',
                email: adminData.correoElectronico || ''
            };
        }

        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        if (userData && Object.keys(userData).length > 0) {
            return {
                id: userData.uid || userData.id,
                uid: userData.uid || userData.id,
                nombreCompleto: userData.nombreCompleto || userData.nombre || 'Usuario',
                organizacion: userData.organizacion || userData.empresa,
                organizacionCamelCase: userData.organizacionCamelCase,
                correo: userData.correo || userData.email || '',
                email: userData.correo || userData.email || ''
            };
        }

        return null;
    } catch (error) {
        console.error('Error obteniendo usuario actual:', error);
        return null;
    }
}

// =============================================
// CARGAR INCIDENCIAS CON PAGINACIÓN REAL
// =============================================
async function cargarIncidenciasPagina(pagina) {
    if (!organizacionActual?.camelCase) {
        console.error('No hay organización configurada');
        return;
    }

    try {
        const tbody = document.getElementById('tablaIncidenciasBody');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding:40px;">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Cargando...</span>
                    </div>
                    <p style="margin-top: 12px; color: var(--color-text-secondary);">Cargando incidencias...</p>
                </td>
            </tr>
        `;

        const resultado = await incidenciaManager.getIncidenciasPaginadas(
            organizacionActual.camelCase,
            filtrosActivos,
            pagina,
            ITEMS_POR_PAGINA,
            cursoresPaginacion
        );

        cursoresPaginacion.ultimoDocumento = resultado.ultimoDocumento;
        cursoresPaginacion.primerDocumento = resultado.primerDocumento;

        incidenciasActuales = resultado.incidencias;
        totalIncidencias = resultado.total;
        totalPaginas = resultado.totalPaginas;
        paginaActual = resultado.paginaActual;

        if (incidenciasActuales.length === 0 && pagina === 1) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center; padding:60px 20px;">
                        <div style="text-align:center;">
                            <i class="fas fa-exclamation-triangle" style="font-size:48px; color:rgba(255,193,7,0.3); margin-bottom:16px;"></i>
                            <h5 style="color:white;">No hay incidencias registradas</h5>
                            <p style="color: var(--color-text-dim); margin-bottom: 20px;">Comienza registrando la primera incidencia de tu organización.</p>
                            <a href="../crearIncidencias/crearIncidencias.html" class="btn-nueva-incidencia-header" style="display:inline-flex; margin-top:16px;">
                                <i class="fas fa-plus-circle"></i> Crear Incidencia
                            </a>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        renderizarIncidencias();

    } catch (error) {
        console.error('Error cargando incidencias:', error);
        mostrarError('Error al cargar incidencias: ' + error.message);
    }
}

window.irPagina = async function (pagina) {
    if (pagina < 1 || pagina > totalPaginas || pagina === paginaActual) return;

    try {
        const tbody = document.getElementById('tablaIncidenciasBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center; padding:40px;">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Cargando...</span>
                        </div>
                        <p style="margin-top: 12px;">Cargando página ${pagina}...</p>
                    </td>
                </tr>
            `;
        }

        let resultado;

        if (pagina > paginaActual) {
            resultado = await incidenciaManager.getIncidenciasPaginadas(
                organizacionActual.camelCase,
                filtrosActivos,
                pagina,
                ITEMS_POR_PAGINA,
                cursoresPaginacion
            );
        } else {
            resultado = await incidenciaManager.getIncidenciasPaginaEspecifica(
                organizacionActual.camelCase,
                filtrosActivos,
                pagina,
                ITEMS_POR_PAGINA
            );
        }

        cursoresPaginacion.ultimoDocumento = resultado.ultimoDocumento;
        cursoresPaginacion.primerDocumento = resultado.primerDocumento;
        incidenciasActuales = resultado.incidencias;
        totalIncidencias = resultado.total;
        totalPaginas = resultado.totalPaginas;
        paginaActual = pagina;

        renderizarIncidencias();

    } catch (error) {
        console.error('Error navegando a página:', error);
        mostrarError('Error al cambiar de página: ' + error.message);
    }
};

function renderizarIncidencias() {
    const tbody = document.getElementById('tablaIncidenciasBody');
    if (!tbody) return;

    const paginationInfo = document.getElementById('paginationInfo');
    if (paginationInfo) {
        const inicio = (paginaActual - 1) * ITEMS_POR_PAGINA + 1;
        const fin = Math.min(inicio + incidenciasActuales.length - 1, totalIncidencias);

        if (totalIncidencias > 0) {
            paginationInfo.textContent = `Mostrando ${inicio}-${fin} de ${totalIncidencias} incidencias`;
        } else {
            paginationInfo.textContent = `Mostrando 0 de 0 incidencias`;
        }
    }

    tbody.innerHTML = '';

    incidenciasActuales.forEach(incidencia => {
        crearFilaIncidencia(incidencia, tbody);
    });

    renderizarPaginacion();
}

function renderizarPaginacion() {
    const pagination = document.getElementById('pagination');
    if (!pagination) return;

    if (totalPaginas <= 1) {
        pagination.innerHTML = '';
        return;
    }

    let html = '';

    html += `
        <li class="page-item ${paginaActual === 1 ? 'disabled' : ''}">
            <button class="page-link" onclick="irPagina(${paginaActual - 1})" ${paginaActual === 1 ? 'disabled' : ''}>
                <i class="fas fa-chevron-left"></i>
            </button>
        </li>
    `;

    const maxPagesToShow = 5;
    let startPage = Math.max(1, paginaActual - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPaginas, startPage + maxPagesToShow - 1);

    if (endPage - startPage + 1 < maxPagesToShow) {
        startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    if (startPage > 1) {
        html += `
            <li class="page-item">
                <button class="page-link" onclick="irPagina(1)">1</button>
            </li>
            ${startPage > 2 ? '<li class="page-item disabled"><span class="page-link">...</span></li>' : ''}
        `;
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `
            <li class="page-item ${i === paginaActual ? 'active' : ''}">
                <button class="page-link" onclick="irPagina(${i})">${i}</button>
            </li>
        `;
    }

    if (endPage < totalPaginas) {
        html += `
            ${endPage < totalPaginas - 1 ? '<li class="page-item disabled"><span class="page-link">...</span></li>' : ''}
            <li class="page-item">
                <button class="page-link" onclick="irPagina(${totalPaginas})">${totalPaginas}</button>
            </li>
        `;
    }

    html += `
        <li class="page-item ${paginaActual === totalPaginas || totalPaginas === 0 ? 'disabled' : ''}">
            <button class="page-link" onclick="irPagina(${paginaActual + 1})" ${paginaActual === totalPaginas || totalPaginas === 0 ? 'disabled' : ''}>
                <i class="fas fa-chevron-right"></i>
            </button>
        </li>
    `;

    pagination.innerHTML = html;
}

function aplicarFiltros() {
    filtrosActivos.estado = document.getElementById('filtroEstado')?.value || 'todos';
    filtrosActivos.nivelRiesgo = document.getElementById('filtroRiesgo')?.value || 'todos';
    filtrosActivos.sucursalId = document.getElementById('filtroSucursal')?.value || 'todos';

    paginaActual = 1;
    cursoresPaginacion = { ultimoDocumento: null, primerDocumento: null };

    cargarIncidenciasPagina(1);
}

function limpiarFiltros() {
    const filtroEstado = document.getElementById('filtroEstado');
    const filtroRiesgo = document.getElementById('filtroRiesgo');
    const filtroSucursal = document.getElementById('filtroSucursal');

    if (filtroEstado) filtroEstado.value = 'todos';
    if (filtroRiesgo) filtroRiesgo.value = 'todos';
    if (filtroSucursal) filtroSucursal.value = 'todos';

    filtrosActivos = {
        estado: 'todos',
        nivelRiesgo: 'todos',
        sucursalId: 'todos'
    };

    paginaActual = 1;
    cursoresPaginacion = { ultimoDocumento: null, primerDocumento: null };

    cargarIncidenciasPagina(1);
}

window.verDetallesIncidencia = function (incidenciaId, event) {
    event?.stopPropagation();
    window.location.href = `../verIncidencias/verIncidencias.html?id=${incidenciaId}`;
};

window.seguimientoIncidencia = function (incidenciaId, event) {
    event?.stopPropagation();
    window.location.href = `../seguimientoIncidencias/seguimientoIncidencias.html?id=${incidenciaId}`;
};
window.compartirIncidencia = async function (incidenciaId, event) {
    event?.stopPropagation();
    
    try {
        // Buscar la incidencia en el caché actual
        const incidencia = incidenciasActuales.find(i => i.id === incidenciaId);
        
        if (!incidencia) {
            throw new Error('Incidencia no encontrada');
        }
        
        // Verificar si tiene PDF
        if (!incidencia.pdfUrl || incidencia.pdfUrl.trim() === '') {
            Swal.fire({
                icon: 'warning',
                title: 'PDF no disponible',
                text: 'Esta incidencia aún no tiene un PDF asociado para compartir.',
                confirmButtonText: 'Entendido'
            });
            return;
        }
        
        // Mostrar diálogo de compartir
            // Mostrar diálogo de compartir
               // Mostrar diálogo de compartir
        const resultado = await Swal.fire({
            title: ' Compartir incidencia',
            html: `
                <div style="text-align: center;">
                    <i class="fas fa-file-pdf" style="font-size: 48px; color: #e74c3c; margin-bottom: 15px; display: inline-block;"></i>
                    <p style="margin-bottom: 20px;">Comparte el informe PDF de esta incidencia</p>
                    <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 15px;">
                        <button id="shareWhatsAppBtn" class="btn-compartir" style="background: linear-gradient(145deg, #0f0f0f, #1a1a1a); border: 1px solid #25D366; border-radius: 8px; padding: 12px; color: white; font-weight: 600; font-family: 'Orbitron', sans-serif; text-transform: uppercase; letter-spacing: 0.5px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; transition: all 0.3s ease;">
                            <i class="fab fa-whatsapp" style="color: #25D366; font-size: 18px;"></i> WhatsApp
                        </button>
                        <button id="shareEmailBtn" class="btn-compartir" style="background: linear-gradient(145deg, #0f0f0f, #1a1a1a); border: 1px solid #0077B5; border-radius: 8px; padding: 12px; color: white; font-weight: 600; font-family: 'Orbitron', sans-serif; text-transform: uppercase; letter-spacing: 0.5px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; transition: all 0.3s ease;">
                            <i class="fas fa-envelope" style="color: #0077B5; font-size: 18px;"></i> Correo Electrónico
                        </button>
                        <button id="shareLinkBtn" class="btn-compartir" style="background: linear-gradient(145deg, #0f0f0f, #1a1a1a); border: 1px solid var(--color-accent-primary); border-radius: 8px; padding: 12px; color: white; font-weight: 600; font-family: 'Orbitron', sans-serif; text-transform: uppercase; letter-spacing: 0.5px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; transition: all 0.3s ease;">
                            <i class="fas fa-link" style="color: var(--color-accent-primary); font-size: 18px;"></i> Copiar Enlace
                        </button>
                        <button id="shareCancelBtn" class="btn-compartir" style="background: linear-gradient(145deg, #0f0f0f, #1a1a1a); border: 1px solid var(--color-border-light); border-radius: 8px; padding: 12px; color: #aaa; font-weight: 600; font-family: 'Orbitron', sans-serif; text-transform: uppercase; letter-spacing: 0.5px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; margin-top: 5px; transition: all 0.3s ease;">
                            <i class="fas fa-times" style="color: #aaa; font-size: 18px;"></i> Cerrar
                        </button>
                    </div>
                </div>
            `,
            icon: 'info',
            showConfirmButton: false,
            showCancelButton: false,
            didOpen: () => {
                const pdfUrl = incidencia.pdfUrl;
                const tituloIncidencia = `INCIDENCIA: ${obtenerNombreSucursal(incidencia.sucursalId)} - ${obtenerNombreCategoria(incidencia.categoriaId)}`;
                const riesgoTexto = incidencia.getNivelRiesgoTexto ? incidencia.getNivelRiesgoTexto() : incidencia.nivelRiesgo;
                const fechaInicio = incidencia.fechaInicio ? 
                    (incidencia.fechaInicio.toDate ? 
                        incidencia.fechaInicio.toDate().toLocaleDateString('es-MX') : 
                        new Date(incidencia.fechaInicio).toLocaleDateString('es-MX')) : 
                    'Fecha no disponible';
                
                const mensajeTexto = ` *${tituloIncidencia}*\n\n` +
                    ` *Sucursal:* ${obtenerNombreSucursal(incidencia.sucursalId)}\n` +
                    ` *Riesgo:* ${riesgoTexto}\n` +
                    ` *Fecha:* ${fechaInicio}\n` +
                    ` *Informe (PDF):* ${pdfUrl}`;
                
                document.getElementById('shareWhatsAppBtn').onclick = () => {
                    Swal.close();
                    const urlWhatsapp = `https://wa.me/?text=${encodeURIComponent(mensajeTexto)}`;
                    window.open(urlWhatsapp, '_blank');
                    Swal.fire({
                        icon: 'success',
                        title: ' WhatsApp abierto',
                        text: 'Se abrirá WhatsApp con el enlace del PDF.',
                        timer: 2500,
                        showConfirmButton: false
                    });
                };
                              document.getElementById('shareEmailBtn').onclick = async () => {
                    Swal.close();
                    
                    // Preguntar qué servicio de correo usa
                    const { value: servicio } = await Swal.fire({
                        title: ' Enviar por correo',
                        text: 'Selecciona tu servicio de correo',
                        icon: 'question',
                        input: 'select',
                        inputOptions: {
                            'gmail': 'Gmail',
                            'outlook': 'Outlook / Hotmail'
                        },
                        inputPlaceholder: 'Selecciona un servicio',
                        showCancelButton: true,
                        confirmButtonText: 'Abrir Correo',
                        cancelButtonText: 'Cancelar',
                        confirmButtonColor: '#ff9122'
                    });
                    
                    if (!servicio) return;
                    
                    const sucursalNombre = obtenerNombreSucursal(incidencia.sucursalId);
                    const categoriaNombre = obtenerNombreCategoria(incidencia.categoriaId);
                    const riesgoTexto = incidencia.getNivelRiesgoTexto ? incidencia.getNivelRiesgoTexto() : incidencia.nivelRiesgo;
                    const estadoTexto = incidencia.getEstadoTexto ? incidencia.getEstadoTexto() : incidencia.estado;
                    const fechaInicio = incidencia.fechaInicio ? 
                        (incidencia.fechaInicio.toDate ? 
                            incidencia.fechaInicio.toDate().toLocaleDateString('es-MX') : 
                            new Date(incidencia.fechaInicio).toLocaleDateString('es-MX')) : 
                        'Fecha no disponible';
                    const pdfUrl = incidencia.pdfUrl;
                    
                    // Título
                    const tituloIncidencia = `INCIDENCIA: ${sucursalNombre} - ${categoriaNombre}`;
                    
                    // Mensaje SIMPLE sin etiquetas HTML
                    const cuerpoTexto = 
                        `${tituloIncidencia}\n\n` +
                        `Sucursal: ${sucursalNombre}\n` +
                        `Categoría: ${categoriaNombre}\n` +
                        `Riesgo: ${riesgoTexto}\n` +
                        `Fecha: ${fechaInicio}\n` +
                        `Estado: ${estadoTexto}\n\n` +
                        `PDF de la incidencia:\n${pdfUrl}\n\n` +
                        `--\nPDF enviado por el sistema Centinela.`;
                    
                    const asunto = encodeURIComponent(tituloIncidencia);
                    const cuerpoCodificado = encodeURIComponent(cuerpoTexto);
                    
                    if (servicio === 'gmail') {
                        window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${asunto}&body=${cuerpoCodificado}`, '_blank');
                    } else {
                        window.open(`https://outlook.live.com/mail/0/deeplink/compose?subject=${asunto}&body=${cuerpoCodificado}`, '_blank');
                    }
                    
                    Swal.fire({
                        icon: 'success',
                        title: ' Correo abierto',
                        text: 'Se abrió tu correo con el enlace del PDF.',
                        timer: 2500,
                        showConfirmButton: false
                    });
                };
                
                document.getElementById('shareLinkBtn').onclick = async () => {
                    Swal.close();
                    try {
                        await navigator.clipboard.writeText(pdfUrl);
                        Swal.fire({
                            icon: 'success',
                            title: 'Enlace copiado',
                            text: 'El enlace del PDF ha sido copiado al portapapeles',
                            timer: 2000,
                            showConfirmButton: false
                        });
                    } catch (err) {
                        Swal.fire({
                            icon: 'info',
                            title: 'Enlace del PDF',
                            html: `<input type="text" value="${pdfUrl}" style="width:100%; padding:8px; margin-top:10px; border-radius:5px;" readonly onclick="this.select()">`,
                            confirmButtonText: 'Cerrar'
                        });
                    }
                };
                
                document.getElementById('shareCancelBtn').onclick = () => {
                    Swal.close();
                };
            }
        });
        
    } catch (error) {
        console.error('Error al compartir:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo compartir la incidencia: ' + error.message
        });
    }
};

/**
 * ABRIR PDF EN VISOR NATIVO DEL NAVEGADOR
 * Utiliza la URL guardada en Firestore y la abre en una nueva pestaña
 */
/**
 * ABRIR PDF EN VISOR NATIVO DEL NAVEGADOR
 * Utiliza la URL guardada en Firestore y la abre en una nueva pestaña
 */
/**
 * ABRIR PDF EN VISOR NATIVO DEL NAVEGADOR (sin Acrobat)
 * Forza el visor integrado de Chrome, Edge, Firefox, Safari, etc.
 */
window.verPDF = async function (incidenciaId, event) {
    event?.stopPropagation();

    try {
        // Buscar la incidencia en el caché actual
        const incidencia = incidenciasActuales.find(i => i.id === incidenciaId);

        if (!incidencia) {
            throw new Error('Incidencia no encontrada');
        }

        // Verificar si tiene URL de PDF guardada
        if (incidencia.pdfUrl && incidencia.pdfUrl.trim() !== '') {
            // OPCIÓN 1: Abrir en nueva pestaña (recomendada)
            // Agrega #toolbar=0 para forzar visor básico del navegador
            const pdfUrl = incidencia.pdfUrl;
            
            // Forzar que el navegador lo muestre, no lo descargue
            // Esto funciona en Chrome, Edge, Firefox, Safari
            window.open(pdfUrl, '_blank');
            
            // Notificación opcional
            Swal.fire({
                icon: 'success',
                title: 'Abriendo PDF',
                text: 'El PDF se abrirá en el visor del navegador',
                timer: 1500,
                showConfirmButton: false,
                toast: true,
                position: 'top-end'
            });
        } else {
            Swal.fire({
                icon: 'info',
                title: 'PDF no disponible',
                text: 'Esta incidencia aún no tiene un PDF asociado.',
                confirmButtonText: 'Entendido'
            });
        }
    } catch (error) {
        console.error('Error al abrir PDF:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo abrir el PDF: ' + error.message
        });
    }
};

window.generarIPHMultiple = async function () {
    try {
        Swal.fire({
            icon: 'info',
            title: 'Información',
            text: 'Los PDFs se generan automáticamente al crear o modificar incidencias.',
            confirmButtonText: 'Entendido'
        });
    } catch (error) {
        console.error('Error:', error);
    }
};

async function cargarSucursales() {
    try {
        const { SucursalManager } = await import('/clases/sucursal.js');
        const sucursalManager = new SucursalManager();

        if (organizacionActual.camelCase) {
            sucursalesCache = await sucursalManager.getSucursalesByOrganizacion(organizacionActual.camelCase);

            const filtroSucursal = document.getElementById('filtroSucursal');
            if (filtroSucursal) {
                filtroSucursal.innerHTML = '<option value="todos">Todas las sucursales</option>';
                sucursalesCache.forEach(suc => {
                    const option = document.createElement('option');
                    option.value = suc.id;
                    option.textContent = suc.nombre;
                    filtroSucursal.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.error('Error cargando sucursales:', error);
        sucursalesCache = [];
    }
}

async function cargarCategorias() {
    try {
        const { CategoriaManager } = await import('/clases/categoria.js');
        const categoriaManager = new CategoriaManager();
        categoriasCache = await categoriaManager.obtenerTodasCategorias();
    } catch (error) {
        console.error('Error cargando categorías:', error);
        categoriasCache = [];
    }
}

async function cargarSubcategorias() {
    try {
        const modulo = await import('/clases/subcategoria.js').catch(() => null);
        if (!modulo) {
            subcategoriasCache = [];
            return;
        }

        const SubcategoriaManager = modulo.SubcategoriaManager || modulo.default;
        if (!SubcategoriaManager) {
            subcategoriasCache = [];
            return;
        }

        const subcategoriaManager = new SubcategoriaManager();

        if (organizacionActual?.camelCase) {
            subcategoriasCache = await subcategoriaManager.obtenerSubcategoriasPorOrganizacion?.(organizacionActual.camelCase) || [];
        } else {
            subcategoriasCache = await subcategoriaManager.obtenerTodasSubcategorias?.() || [];
        }
    } catch (error) {
        console.error('Error cargando subcategorías:', error);
        subcategoriasCache = [];
    }
}

async function cargarUsuarios() {
    try {
        const modulo = await import('/clases/user.js').catch(() => null);
        if (!modulo) {
            usuariosCache = [];
            return;
        }

        const UsuarioManager = modulo.UsuarioManager || modulo.default || modulo;

        if (typeof UsuarioManager !== 'function') {
            usuariosCache = [];
            return;
        }

        const usuarioManager = new UsuarioManager();

        if (organizacionActual.camelCase && typeof usuarioManager.obtenerUsuariosPorOrganizacion === 'function') {
            usuariosCache = await usuarioManager.obtenerUsuariosPorOrganizacion(organizacionActual.camelCase);
        } else {
            usuariosCache = [];
        }
    } catch (error) {
        console.error('Error cargando usuarios:', error);
        usuariosCache = [];
    }
}

function obtenerNombreSucursal(sucursalId) {
    if (!sucursalId) return 'No especificada';
    const sucursal = sucursalesCache.find(s => s.id === sucursalId);
    return sucursal ? sucursal.nombre : 'No disponible';
}

function obtenerNombreCategoria(categoriaId) {
    if (!categoriaId) return 'No especificada';
    const categoria = categoriasCache.find(c => c.id === categoriaId);
    return categoria ? categoria.nombre : 'No disponible';
}

function crearFilaIncidencia(incidencia, tbody) {
    const tr = document.createElement('tr');
    tr.className = 'incidencia-row';
    tr.dataset.id = incidencia.id;

    const riesgoTexto = incidencia.getNivelRiesgoTexto ? incidencia.getNivelRiesgoTexto() : incidencia.nivelRiesgo;
    const riesgoColor = incidencia.getNivelRiesgoColor ? incidencia.getNivelRiesgoColor() : '';
    const estadoTexto = incidencia.getEstadoTexto ? incidencia.getEstadoTexto() : incidencia.estado;

    const fechaInicio = incidencia.fechaInicio ?
        (incidencia.fechaInicio.toDate ?
            incidencia.fechaInicio.toDate().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }) :
            new Date(incidencia.fechaInicio).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })) :
        'N/A';

    // ID COMPLETO - sin truncar
    tr.innerHTML = `
        <td data-label="ID / Folio" class="id-cell">
            <span class="incidencia-id" title="${incidencia.id}">${incidencia.id}</span>
        </td>
        <td data-label="Sucursal">
            <div style="display: flex; align-items: center;">
                <div style="width:4px; height:24px; background:#00cfff; border-radius:2px; margin-right:12px; flex-shrink:0;"></div>
                <div>
                    <strong title="${obtenerNombreSucursal(incidencia.sucursalId)}">${obtenerNombreSucursal(incidencia.sucursalId)}</strong>
                </div>
            </div>
        </td>
        <td data-label="Categoría">
            <div style="display: flex; align-items: center;">
                <span>${obtenerNombreCategoria(incidencia.categoriaId)}</span>
            </div>
        </td>
        <td data-label="Riesgo">
            <span class="riesgo-badge ${incidencia.nivelRiesgo}" style="background: ${riesgoColor}20; color: ${riesgoColor}; border-color: ${riesgoColor}40;">
                ${riesgoTexto}
            </span>
        </td>
        <td data-label="Estado">
            <span class="estado-badge ${incidencia.estado}">
                ${estadoTexto}
            </span>
        </td>
        <td data-label="Fecha">
            ${fechaInicio}
        </td>
       <td data-label="Acciones">
    <div class="btn-group" style="display: flex; gap: 6px; flex-wrap: wrap;">
        <button type="button" class="btn" data-action="ver" data-id="${incidencia.id}" title="Ver detalles">
            <i class="fas fa-eye"></i>
        </button>
        <button type="button" class="btn" data-action="pdf" data-id="${incidencia.id}" title="Ver PDF">
            <i class="fas fa-file-pdf" style="color: #c0392b;"></i>
        </button>
        <button type="button" class="btn" data-action="compartir" data-id="${incidencia.id}" title="Compartir">
            <i class="fas fa-share-alt" style="color: #00cfff;"></i>
        </button>
        <button type="button" class="btn btn-success" data-action="seguimiento" data-id="${incidencia.id}" title="Seguimiento">
            <i class="fas fa-history"></i>
        </button>
    </div>
</td>
    `;

    tbody.appendChild(tr);

   setTimeout(() => {
    tr.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            const id = btn.dataset.id;
            if (action === 'ver') window.verDetallesIncidencia(id, e);
            else if (action === 'pdf') window.verPDF(id, e);
            else if (action === 'compartir') window.compartirIncidencia(id, e);
            else if (action === 'seguimiento') window.seguimientoIncidencia(id, e);
        });
    });
}, 50);
}

function agregarBotonIPHMultiple() {
    const cardHeader = document.querySelector('.card-header');
    if (cardHeader) {
        const btnIPHMultiple = document.createElement('button');
        btnIPHMultiple.className = 'btn-nueva-incidencia-header';
        btnIPHMultiple.style.marginLeft = '10px';
        btnIPHMultiple.innerHTML = '<i class="fas fa-file-pdf"></i> IPH Múltiple';
        btnIPHMultiple.onclick = window.generarIPHMultiple;

        const btnNueva = cardHeader.querySelector('.btn-nueva-incidencia-header');
        if (btnNueva) {
            btnNueva.parentNode.insertBefore(btnIPHMultiple, btnNueva.nextSibling);
        } else {
            cardHeader.appendChild(btnIPHMultiple);
        }
    }
}

function configurarEventListeners() {
    const btnFiltrar = document.getElementById('btnFiltrar');
    const btnLimpiar = document.getElementById('btnLimpiarFiltros');

    if (btnFiltrar) {
        btnFiltrar.addEventListener('click', aplicarFiltros);
    }

    if (btnLimpiar) {
        btnLimpiar.addEventListener('click', limpiarFiltros);
    }
}

function escapeHTML(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function mostrarError(mensaje) {
    const tbody = document.getElementById('tablaIncidenciasBody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding:40px;">
                    <div style="color: #ef4444;">
                        <i class="fas fa-exclamation-circle" style="font-size: 48px; margin-bottom: 16px;"></i>
                        <h5>Error</h5>
                        <p>${escapeHTML(mensaje)}</p>
                        <button class="btn-nueva-incidencia-header" onclick="location.reload()" style="margin-top: 16px;">
                            <i class="fas fa-sync-alt"></i> Reintentar
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }
}

function mostrarErrorInicializacion() {
    const tbody = document.getElementById('tablaIncidenciasBody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding:40px;">
                    <div style="color: #ef4444;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 16px;"></i>
                        <h5>Error de inicialización</h5>
                        <p>No se pudo cargar el módulo de incidencias.</p>
                        <button class="btn-nueva-incidencia-header" onclick="location.reload()" style="margin-top: 16px;">
                            <i class="fas fa-sync-alt"></i> Reintentar
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }
}

async function obtenerDatosOrganizacion() {
    try {
        const usuario = obtenerUsuarioActual();
        if (usuario) {
            organizacionActual = {
                nombre: usuario.organizacion || 'Mi Empresa',
                camelCase: usuario.organizacionCamelCase || ''
            };
            return;
        }

        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        const adminInfo = JSON.parse(localStorage.getItem('adminInfo') || '{}');

        organizacionActual = {
            nombre: userData.organizacion || adminInfo.organizacion || 'Mi Empresa',
            camelCase: userData.organizacionCamelCase || adminInfo.organizacionCamelCase || ''
        };
    } catch (error) {
        organizacionActual = { nombre: 'Mi Empresa', camelCase: '' };
    }
}

async function inicializarIncidenciaManager() {
    try {
        await obtenerDatosOrganizacion();

        incidenciaManager = new IncidenciaManager();

        await Promise.all([
            cargarSucursales().catch(() => { console.warn('Error cargando sucursales'); }),
            cargarCategorias().catch(() => { console.warn('Error cargando categorías'); }),
            cargarSubcategorias().catch(() => { console.warn('Error cargando subcategorías'); }),
            cargarUsuarios().catch(() => { console.warn('Error cargando usuarios'); })
        ]);

        if (generadorIPH && typeof generadorIPH.configurar === 'function') {
            generadorIPH.configurar({
                organizacionActual,
                sucursalesCache,
                categoriasCache,
                subcategoriasCache,
                usuariosCache
            });
        }

        configurarEventListeners();
        agregarBotonIPHMultiple();

        await cargarIncidenciasPagina(1);

        return true;
    } catch (error) {
        console.error('Error al inicializar incidencias:', error);
        mostrarErrorInicializacion();
        return false;
    }
}

document.addEventListener('DOMContentLoaded', async function () {
    await inicializarIncidenciaManager();
});