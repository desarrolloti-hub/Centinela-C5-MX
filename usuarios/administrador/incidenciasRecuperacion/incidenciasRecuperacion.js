// mercanciaPerdida.js - CONTROLADOR
// VERSIÓN ACTUALIZADA - SIN BOTÓN DE ELIMINAR, SIN COLUMNA ESTADO Y CON ID COMPLETO

import { MercanciaPerdidaManager } from '/clases/incidenciaRecuperacion.js';
import '/components/visualizadorPDF.js';

// =============================================
// VARIABLES GLOBALES
// =============================================
let mercanciaManager = null;
let organizacionActual = null;
let empresasCache = [];
let registrosActuales = [];

// Configuración de paginación
const ITEMS_POR_PAGINA = 10;
let paginaActual = 1;
let totalRegistros = 0;
let totalPaginas = 0;
let cursoresPaginacion = {
    ultimoDocumento: null,
    primerDocumento: null
};

// Filtros activos
let filtrosActivos = {
    estado: 'todos',
    tipoEvento: 'todos',
    nombreEmpresaCC: 'todos'
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
// CARGAR REGISTROS CON PAGINACIÓN
// =============================================
async function cargarRegistrosPagina(pagina) {
    if (!organizacionActual?.camelCase) {
        console.error('No hay organización configurada');
        return;
    }

    try {
        const tbody = document.getElementById('tablaRegistrosBody');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center; padding:40px;">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Cargando...</span>
                    </div>
                    <p style="margin-top: 12px; color: var(--color-text-secondary);">Cargando registros...</p>
                </td>
            </tr>
        `;

        const resultado = await mercanciaManager.getRegistrosPaginados(
            organizacionActual.camelCase,
            filtrosActivos,
            pagina,
            ITEMS_POR_PAGINA,
            cursoresPaginacion
        );

        cursoresPaginacion.ultimoDocumento = resultado.ultimoDocumento;
        cursoresPaginacion.primerDocumento = resultado.primerDocumento;

        registrosActuales = resultado.registros;
        totalRegistros = resultado.total;
        totalPaginas = resultado.totalPaginas;
        paginaActual = resultado.paginaActual;

        if (registrosActuales.length === 0 && pagina === 1) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center; padding:60px 20px;">
                        <div style="text-align:center;">
                            <i class="fas fa-box-open" style="font-size:48px; color:rgba(0,207,255,0.3); margin-bottom:16px;"></i>
                            <h5 style="color:white;">No hay registros de mercancía perdida</h5>
                            <p style="color: var(--color-text-dim); margin-bottom: 20px;">Comienza registrando el primer incidente de mercancía perdida o robada.</p>
                            <a href="/usuarios/administrador/crearIncidenciasRecuperacion/crearIncidenciasRecuperacion.html" class="btn-nuevo-registro-header" style="display:inline-flex; margin-top:16px;">
                                <i class="fas fa-plus-circle"></i> Nuevo Registro
                            </a>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        renderizarRegistros();

    } catch (error) {
        console.error('Error cargando registros:', error);
        mostrarError('Error al cargar registros: ' + error.message);
    }
}

window.irPagina = async function (pagina) {
    if (pagina < 1 || pagina > totalPaginas || pagina === paginaActual) return;

    try {
        const tbody = document.getElementById('tablaRegistrosBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center; padding:40px;">
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
            resultado = await mercanciaManager.getRegistrosPaginados(
                organizacionActual.camelCase,
                filtrosActivos,
                pagina,
                ITEMS_POR_PAGINA,
                cursoresPaginacion
            );
        } else {
            resultado = await mercanciaManager.getRegistrosPaginaEspecifica?.(
                organizacionActual.camelCase,
                filtrosActivos,
                pagina,
                ITEMS_POR_PAGINA
            ) || await mercanciaManager.getRegistrosPaginados(
                organizacionActual.camelCase,
                filtrosActivos,
                pagina,
                ITEMS_POR_PAGINA,
                null
            );
        }

        cursoresPaginacion.ultimoDocumento = resultado.ultimoDocumento;
        cursoresPaginacion.primerDocumento = resultado.primerDocumento;
        registrosActuales = resultado.registros;
        totalRegistros = resultado.total;
        totalPaginas = resultado.totalPaginas;
        paginaActual = pagina;

        renderizarRegistros();

    } catch (error) {
        console.error('Error navegando a página:', error);
        mostrarError('Error al cambiar de página: ' + error.message);
    }
};

function renderizarRegistros() {
    const tbody = document.getElementById('tablaRegistrosBody');
    if (!tbody) return;

    const paginationInfo = document.getElementById('paginationInfo');
    if (paginationInfo) {
        const inicio = (paginaActual - 1) * ITEMS_POR_PAGINA + 1;
        const fin = Math.min(inicio + registrosActuales.length - 1, totalRegistros);

        if (totalRegistros > 0) {
            paginationInfo.textContent = `Mostrando ${inicio}-${fin} de ${totalRegistros} registros`;
        } else {
            paginationInfo.textContent = `Mostrando 0 de 0 registros`;
        }
    }

    tbody.innerHTML = '';

    registrosActuales.forEach(registro => {
        crearFilaRegistro(registro, tbody);
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
    filtrosActivos.tipoEvento = document.getElementById('filtroTipoEvento')?.value || 'todos';
    filtrosActivos.nombreEmpresaCC = document.getElementById('filtroEmpresa')?.value || 'todos';

    paginaActual = 1;
    cursoresPaginacion = { ultimoDocumento: null, primerDocumento: null };

    cargarRegistrosPagina(1);
}

function limpiarFiltros() {
    const filtroEstado = document.getElementById('filtroEstado');
    const filtroTipoEvento = document.getElementById('filtroTipoEvento');
    const filtroEmpresa = document.getElementById('filtroEmpresa');

    if (filtroEstado) filtroEstado.value = 'todos';
    if (filtroTipoEvento) filtroTipoEvento.value = 'todos';
    if (filtroEmpresa) filtroEmpresa.value = 'todos';

    filtrosActivos = {
        estado: 'todos',
        tipoEvento: 'todos',
        nombreEmpresaCC: 'todos'
    };

    paginaActual = 1;
    cursoresPaginacion = { ultimoDocumento: null, primerDocumento: null };

    cargarRegistrosPagina(1);
}


// =============================================
// VER PDF (abre en nueva pestaña con visor nativo)
// =============================================
window.verPDF = async function (registroId, event) {
    event?.stopPropagation();

    try {
        const registro = registrosActuales.find(r => r.id === registroId);

        if (!registro) {
            throw new Error('Registro no encontrado');
        }

        if (registro.pdfUrl && registro.pdfUrl.trim() !== '') {
            // Abrir PDF en nueva pestaña con el visor nativo del navegador
            window.open(registro.pdfUrl, '_blank');

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
        } else if (registro.estadoGeneracion === 'generando') {
            Swal.fire({
                icon: 'info',
                title: 'Generando PDF',
                text: 'El PDF se está generando en segundo plano. Recibirás una notificación cuando esté listo.',
                confirmButtonText: 'Entendido'
            });
        } else if (registro.estadoGeneracion === 'pendiente') {
            Swal.fire({
                icon: 'info',
                title: 'PDF pendiente',
                text: 'La generación del PDF comenzará en breve. Recibirás una notificación cuando esté listo.',
                confirmButtonText: 'Entendido'
            });
        } else if (registro.estadoGeneracion === 'error') {
            Swal.fire({
                icon: 'error',
                title: 'Error al generar PDF',
                text: 'Hubo un problema al generar el PDF. Por favor, contacta al administrador.',
                confirmButtonText: 'Entendido'
            });
        } else {
            Swal.fire({
                icon: 'info',
                title: 'PDF no disponible',
                text: 'Este registro aún no tiene un PDF generado. Se generará automáticamente en segundo plano.',
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
// =============================================
// COMPARTIR REGISTRO (WhatsApp, Email, Copiar enlace)
// =============================================
window.compartirRegistro = async function (registroId, event) {
    event?.stopPropagation();
    
    try {
        const registro = registrosActuales.find(r => r.id === registroId);
        
        if (!registro) {
            throw new Error('Registro no encontrado');
        }
        
        if (!registro.pdfUrl || registro.pdfUrl.trim() === '') {
            Swal.fire({
                icon: 'warning',
                title: 'PDF no disponible',
                text: 'Este registro aún no tiene un PDF asociado para compartir.',
                confirmButtonText: 'Entendido'
            });
            return;
        }
        
        const uiData = registro.toUI ? registro.toUI() : registro;
        const tituloRegistro = `MERCANCÍA: ${uiData.nombreEmpresaCC} - ${uiData.tipoEventoTexto || uiData.tipoEvento}`;
        const perdidoFormateado = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(uiData.montoPerdido);
        const recuperadoFormateado = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(uiData.montoRecuperado);
        const fechaEvento = uiData.fecha || registro.getFechaFormateada?.() || 'Fecha no disponible';
        
        const mensajeTexto = `📦 *${tituloRegistro}*\n\n` +
            `🏢 *Empresa/CC:* ${uiData.nombreEmpresaCC}\n` +
            `💰 *Monto Perdido:* ${perdidoFormateado}\n` +
            `✅ *Monto Recuperado:* ${recuperadoFormateado}\n` +
            `📅 *Fecha:* ${fechaEvento}\n` +
            `📄 *Informe PDF:* ${registro.pdfUrl}`;
        
        const resultado = await Swal.fire({
            title: '📤 Compartir registro',
            html: `
                <div style="text-align: center;">
                    <i class="fas fa-file-pdf" style="font-size: 48px; color: #e74c3c; margin-bottom: 15px; display: inline-block;"></i>
                    <p style="margin-bottom: 20px;">Comparte el informe PDF de este registro</p>
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
                const pdfUrl = registro.pdfUrl;
                
                document.getElementById('shareWhatsAppBtn').onclick = () => {
                    Swal.close();
                    const urlWhatsapp = `https://wa.me/?text=${encodeURIComponent(mensajeTexto)}`;
                    window.open(urlWhatsapp, '_blank');
                    Swal.fire({
                        icon: 'success',
                        title: '💚 WhatsApp abierto',
                        text: 'Se abrirá WhatsApp con el enlace del PDF.',
                        timer: 2500,
                        showConfirmButton: false
                    });
                };
                
                document.getElementById('shareEmailBtn').onclick = () => {
                    Swal.close();
                    const asunto = encodeURIComponent(tituloRegistro);
                    const cuerpoTexto = 
                        `${tituloRegistro}\n\n` +
                        `Empresa/CC: ${uiData.nombreEmpresaCC}\n` +
                        `Tipo: ${uiData.tipoEventoTexto || uiData.tipoEvento}\n` +
                        `Monto Perdido: ${perdidoFormateado}\n` +
                        `Monto Recuperado: ${recuperadoFormateado}\n` +
                        `Fecha: ${fechaEvento}\n\n` +
                        `📄 PDF del registro:\n${pdfUrl}\n\n` +
                        `--\nEste informe ha sido generado automáticamente por el sistema Centinela.`;
                    
                    window.location.href = `mailto:?subject=${asunto}&body=${encodeURIComponent(cuerpoTexto)}`;
                    
                    Swal.fire({
                        icon: 'success',
                        title: '📧 Cliente de correo abierto',
                        text: 'Se abrió tu cliente de correo con el enlace del PDF.',
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
                            title: '🔗 Enlace copiado',
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
            text: 'No se pudo compartir el registro: ' + error.message
        });
    }
};

window.verDetallesRegistro = function (registroId, event) {
    event?.stopPropagation();
    const registro = registrosActuales.find(r => r.id === registroId);
    if (registro) {
        mostrarModalDetalles(registro);
    }
};

window.registrarRecuperacion = function (registroId, event) {
    event?.stopPropagation();
    const registro = registrosActuales.find(r => r.id === registroId);
    if (registro) {
        mostrarModalRecuperacion(registro);
    }
};

function mostrarModalDetalles(registro) {
    const modal = document.getElementById('modalDetalles');
    const body = document.getElementById('modalDetallesBody');

    if (!modal || !body) return;

    const uiData = registro.toUI ? registro.toUI() : registro;

    const perdidoFormateado = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(uiData.montoPerdido);
    const recuperadoFormateado = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(uiData.montoRecuperado);
    const netoFormateado = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(uiData.montoNeto || (uiData.montoPerdido - uiData.montoRecuperado));

    let evidenciasHtml = '';
    if (uiData.evidencias && uiData.evidencias.length > 0) {
        evidenciasHtml = `
            <div class="evidencias-container">
                <h6><i class="fas fa-images"></i> Evidencias (${uiData.evidencias.length})</h6>
                <div class="evidencias-grid">
                    ${uiData.evidencias.map(ev => `
                        <div class="evidencia-item" onclick="verImagenGrande('${ev.url}')">
                            <img src="${ev.url}" alt="Evidencia">
                            ${ev.comentario ? `<div class="evidencia-comentario"><i class="fas fa-comment"></i> ${escapeHTML(ev.comentario.substring(0, 40))}${ev.comentario.length > 40 ? '...' : ''}</div>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    let recuperacionesHtml = '';
    if (registro.historialRecuperaciones && registro.historialRecuperaciones.length > 0) {
        recuperacionesHtml = `
            <div class="detalle-card full-width">
                <p><strong>Historial de Recuperaciones</strong></p>
                ${registro.historialRecuperaciones.map(rec => `
                    <p><span>💰 ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(rec.monto)} - ${rec.comentario || 'Sin comentario'} (${new Date(rec.fecha).toLocaleDateString()})</span></p>
                `).join('')}
            </div>
        `;
    }

    const estadoPDF = uiData.estadoGeneracion || 'pendiente';
    const estadoPDFTexto = uiData.estadoGeneracionTexto || 'Pendiente';
    const estadoPDFColor = uiData.estadoGeneracionColor || '#ffc107';

    body.innerHTML = `
        <div class="detalles-grid">
            <div class="detalle-card">
                <p><strong>ID / Folio</strong></p>
                <p><span style="font-family: monospace; word-break: break-all;">${escapeHTML(uiData.id)}</span></p>
            </div>
            <div class="detalle-card">
                <p><strong>Empresa / Centro Comercial</strong></p>
                <p><span>${escapeHTML(uiData.nombreEmpresaCC)}</span></p>
            </div>
            <div class="detalle-card">
                <p><strong>Tipo de Evento</strong></p>
                <p><span>${uiData.tipoEventoTexto || uiData.tipoEvento}</span></p>
            </div>
            <div class="detalle-card">
                <p><strong>Estado</strong></p>
                <p><span>${uiData.estadoTexto || uiData.estado}</span></p>
            </div>
            <div class="detalle-card">
                <p><strong>Estado del PDF</strong></p>
                <p><span style="color: ${estadoPDFColor};">${estadoPDFTexto}</span></p>
            </div>
            <div class="detalle-card">
                <p><strong>Monto Perdido</strong></p>
                <p><span class="monto-perdido">${perdidoFormateado}</span></p>
            </div>
            <div class="detalle-card">
                <p><strong>Monto Recuperado</strong></p>
                <p><span class="monto-recuperado">${recuperadoFormateado}</span></p>
            </div>
            <div class="detalle-card">
                <p><strong>Monto Neto</strong></p>
                <p><span>${netoFormateado}</span></p>
            </div>
            <div class="detalle-card">
                <p><strong>Porcentaje Recuperado</strong></p>
                <p><span>${uiData.porcentajeRecuperado?.toFixed(2) || '0'}%</span></p>
            </div>
            <div class="detalle-card">
                <p><strong>Fecha del Evento</strong></p>
                <p><span>${uiData.fecha || registro.getFechaFormateada?.() || 'No disponible'}</span></p>
            </div>
            <div class="detalle-card">
                <p><strong>Hora</strong></p>
                <p><span>${uiData.hora || registro.getHoraFormateada?.() || 'No disponible'}</span></p>
            </div>
            ${uiData.ubicacion ? `
            <div class="detalle-card">
                <p><strong>Ubicación</strong></p>
                <p><span>${escapeHTML(uiData.ubicacion)}</span></p>
            </div>
            ` : ''}
            ${uiData.responsableAsignado ? `
            <div class="detalle-card">
                <p><strong>Responsable Asignado</strong></p>
                <p><span>${escapeHTML(uiData.responsableAsignado)}</span></p>
            </div>
            ` : ''}
            <div class="detalle-card full-width">
                <p><strong>Narración de los Eventos</strong></p>
                <p><span>${escapeHTML(uiData.narracionEventos || 'No disponible')}</span></p>
            </div>
            ${uiData.detallesPerdida ? `
            <div class="detalle-card full-width">
                <p><strong>Detalles de la Pérdida</strong></p>
                <p><span>${escapeHTML(uiData.detallesPerdida)}</span></p>
            </div>
            ` : ''}
            <div class="detalle-card">
                <p><strong>Reportado por</strong></p>
                <p><span>${escapeHTML(uiData.reportadoPorNombre || 'No disponible')}</span></p>
            </div>
            <div class="detalle-card">
                <p><strong>Fecha de Creación</strong></p>
                <p><span>${uiData.fechaCreacion || 'No disponible'}</span></p>
            </div>
            ${recuperacionesHtml}
        </div>
        ${evidenciasHtml}
        ${uiData.pdfUrl ? `
        <div style="margin-top: 20px; text-align: center;">
            <button class="btn btn-primary" onclick="window.visualizadorPDF.abrir('${uiData.pdfUrl}', 'Reporte ${uiData.id}')">
                <i class="fas fa-file-pdf"></i> Ver PDF
            </button>
        </div>
        ` : ''}
    `;

    modal.classList.add('show');
}

window.verImagenGrande = function (url) {
    const viewer = document.createElement('div');
    viewer.className = 'modal-image-viewer';
    viewer.innerHTML = `
        <button class="close-btn" onclick="this.parentElement.remove()">×</button>
        <img src="${url}" alt="Evidencia ampliada">
    `;
    viewer.onclick = (e) => {
        if (e.target === viewer) viewer.remove();
    };
    document.body.appendChild(viewer);
};

window.cerrarModalDetalles = function () {
    const modal = document.getElementById('modalDetalles');
    if (modal) modal.classList.remove('show');
};

async function mostrarModalRecuperacion(registro) {
    const { value: monto } = await Swal.fire({
        title: 'Registrar Recuperación',
        text: `Registro: ${registro.nombreEmpresaCC}`,
        input: 'number',
        inputLabel: 'Monto recuperado',
        inputPlaceholder: '0.00',
        inputAttributes: {
            step: '0.01',
            min: '0.01'
        },
        showCancelButton: true,
        confirmButtonText: 'Registrar',
        cancelButtonText: 'Cancelar',
        inputValidator: (value) => {
            if (!value || parseFloat(value) <= 0) {
                return 'Debes ingresar un monto válido mayor a 0';
            }
        }
    });

    if (monto) {
        const { value: comentario } = await Swal.fire({
            title: 'Comentario',
            text: 'Agrega un comentario sobre esta recuperación',
            input: 'textarea',
            inputPlaceholder: 'Ej: Se recuperó parte de la mercancía en bodega...',
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar'
        });

        try {
            Swal.fire({
                title: 'Procesando...',
                text: 'Registrando recuperación',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });

            const usuario = obtenerUsuarioActual();

            await mercanciaManager.registrarRecuperacion(
                registro.id,
                parseFloat(monto),
                comentario || '',
                usuario?.id || 'sistema',
                usuario?.nombreCompleto || 'Sistema',
                organizacionActual.camelCase,
                usuario
            );

            Swal.close();
            Swal.fire({
                icon: 'success',
                title: 'Recuperación registrada',
                text: `Se ha registrado la recuperación de $${parseFloat(monto).toLocaleString()}`
            });

            await cargarRegistrosPagina(paginaActual);

        } catch (error) {
            console.error('Error registrando recuperación:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: error.message || 'No se pudo registrar la recuperación'
            });
        }
    }
}

function crearFilaRegistro(registro, tbody) {
    const tr = document.createElement('tr');
    tr.className = 'registro-row';
    tr.dataset.id = registro.id;

    const uiData = registro.toUI ? registro.toUI() : registro;

    const perdidoFormateado = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(uiData.montoPerdido);
    const recuperadoFormateado = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(uiData.montoRecuperado);
    const fechaFormateada = uiData.fecha || registro.getFechaFormateada?.() || 'N/A';

    const tienePDF = uiData.tienePDF || (uiData.pdfGenerado === true && uiData.pdfUrl);
    const pdfIcono = tienePDF ? '<i class="fas fa-file-pdf" style="color: #c0392b;"></i>' : '<i class="fas fa-file-pdf" style="color: #6c757d;"></i>';
    const pdfTitle = tienePDF ? 'Ver PDF' : (uiData.estadoGeneracion === 'generando' ? 'Generando PDF...' : 'PDF pendiente');

    tr.innerHTML = `
        <td data-label="ID / Folio">
            <span class="registro-id" title="${registro.id}">${escapeHTML(registro.id)}</span>
        </td>
        <td data-label="Empresa/CC">
            <div style="display: flex; align-items: center;">
                <div style="width:4px; height:24px; background:#00cfff; border-radius:2px; margin-right:12px; flex-shrink:0;"></div>
                <div>
                    <strong title="${escapeHTML(uiData.nombreEmpresaCC)}">${escapeHTML(uiData.nombreEmpresaCC.substring(0, 30))}${uiData.nombreEmpresaCC.length > 30 ? '...' : ''}</strong>
                </div>
            </div>
        </td>
        <td data-label="Tipo">
            <span class="tipo-badge ${uiData.tipoEvento}">
                <i class="fas ${uiData.tipoEvento === 'robo' ? 'fa-mask' : uiData.tipoEvento === 'extravio' ? 'fa-question-circle' : uiData.tipoEvento === 'accidente' ? 'fa-car-crash' : 'fa-ellipsis-h'}"></i>
                ${uiData.tipoEventoTexto || uiData.tipoEvento}
            </span>
        </td>
        <td data-label="Monto Perdido">
            <span class="monto-text monto-perdido">${perdidoFormateado}</span>
        </td>
        <td data-label="Monto Recuperado">
            <span class="monto-text monto-recuperado">${recuperadoFormateado}</span>
        </td>
        <td data-label="Fecha">
            ${fechaFormateada}
        </td>
       <td data-label="Acciones">
    <div class="btn-group" style="display: flex; gap: 6px; flex-wrap: wrap;">
        <button type="button" class="btn" data-action="ver" data-id="${registro.id}" title="Ver detalles">
            <i class="fas fa-eye"></i>
        </button>
        <button type="button" class="btn" data-action="pdf" data-id="${registro.id}" title="${pdfTitle}">
            ${pdfIcono}
        </button>
        <button type="button" class="btn" data-action="compartir" data-id="${registro.id}" title="Compartir">
            <i class="fas fa-share-alt" style="color: #00cfff;"></i>
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
                    if (action === 'ver') window.verDetallesRegistro(id, e);
                    else if (action === 'pdf') window.verPDF(id, e);
                    else if (action === 'compartir') window.compartirRegistro(id, e);
                });
            });
            // ...
        }, 50);
        }

async function cargarEmpresas() {
    try {
        if (organizacionActual?.camelCase && mercanciaManager) {
            const registros = await mercanciaManager.getRegistrosByOrganizacion(organizacionActual.camelCase);
            const empresasUnicas = [...new Set(registros.map(r => r.nombreEmpresaCC).filter(Boolean))];
            empresasCache = empresasUnicas;

            const filtroEmpresa = document.getElementById('filtroEmpresa');
            if (filtroEmpresa) {
                filtroEmpresa.innerHTML = '<option value="todos">Todas las empresas</option>';
                empresasCache.forEach(emp => {
                    const option = document.createElement('option');
                    option.value = emp;
                    option.textContent = emp;
                    filtroEmpresa.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.error('Error cargando empresas:', error);
        empresasCache = [];
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
    const tbody = document.getElementById('tablaRegistrosBody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center; padding:40px;">
                    <div style="color: #ef4444;">
                        <i class="fas fa-exclamation-circle" style="font-size: 48px; margin-bottom: 16px;"></i>
                        <h5>Error</h5>
                        <p>${escapeHTML(mensaje)}</p>
                        <button class="btn-nuevo-registro-header" onclick="location.reload()" style="margin-top: 16px;">
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

async function inicializarMercanciaManager() {
    try {
        await obtenerDatosOrganizacion();

        mercanciaManager = new MercanciaPerdidaManager();

        configurarEventListeners();

        await cargarRegistrosPagina(1);
        await cargarEmpresas();

        return true;
    } catch (error) {
        console.error('Error al inicializar mercancía perdida:', error);
        mostrarError('No se pudo cargar el módulo de mercancía perdida');
        return false;
    }
}

document.addEventListener('DOMContentLoaded', async function () {
    await inicializarMercanciaManager();
});