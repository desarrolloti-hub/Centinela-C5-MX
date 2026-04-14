// monitoreo.js - Controlador de la vista de monitoreo
// CORREGIDO: Obtiene paneles desde la colección "paneles_info"

import { Evento } from '/clases/evento.js';
import { CuentaPM } from '/clases/cuentaPM.js';
import { db } from '/config/firebase-config.js';
import { 
    collection, 
    query, 
    where, 
    orderBy, 
    limit, 
    onSnapshot,
    getDocs
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

// ========== VARIABLES GLOBALES ==========
let todosLosEventos = [];
let eventosFiltrados = [];
let usuarioActual = null;
let filtroActivo = 'all';
let terminoBusqueda = '';
let unsubscribeEventos = null;
let emailsAsociados = [];
let panelesInfo = []; // Almacenar información de paneles
let primerCargaCompletada = false;

const ITEMS_POR_PAGINA = 15;
let paginaActual = 1;

// ========== INICIALIZACIÓN ==========
document.addEventListener('DOMContentLoaded', async function() {
    try {
        console.log('🚀 Iniciando Monitoreo de Eventos (Tiempo Real)...');
        
        usuarioActual = obtenerUsuarioActual();
        if (!usuarioActual) throw new Error('No se encontró información del usuario');
        
        console.log('👤 Usuario:', usuarioActual.nombreCompleto);
        console.log('📧 Email usuario:', usuarioActual.correoElectronico);
        
        actualizarInfoUsuario();
        
        // Obtener emails asociados desde Cuentas PM
        await cargarEmailsAsociados();
        
        // Obtener paneles desde la colección "paneles_info"
        await cargarPanelesInfo();
        
        // Iniciar escucha en tiempo real de eventos
        await iniciarEscuchaTiempoReal();
        
        configurarEventosUI();
        
    } catch (error) {
        console.error('❌ Error:', error);
        mostrarError(error.message);
    }
});

function obtenerUsuarioActual() {
    try {
        const userDataStr = localStorage.getItem('userData');
        if (!userDataStr) return null;
        const userData = JSON.parse(userDataStr);
        return {
            id: userData.id || userData.uid,
            nombreCompleto: userData.nombreCompleto || userData.nombre || 'Usuario',
            organizacion: userData.organizacion || '',
            organizacionCamelCase: userData.organizacionCamelCase || '',
            correoElectronico: userData.correoElectronico || userData.email || '',
            rol: userData.rol || 'colaborador'
        };
    } catch (error) {
        console.error('❌ Error parseando userData:', error);
        return null;
    }
}

function actualizarInfoUsuario() {
    const organizacionInfo = document.getElementById('organizacionInfo');
    if (organizacionInfo && usuarioActual) {
        organizacionInfo.textContent = usuarioActual.organizacion || 'Organización';
    }
}

// ========== CARGAR EMAILS ASOCIADOS DESDE CUENTAS PM ==========
async function cargarEmailsAsociados() {
    try {
        if (!usuarioActual?.organizacionCamelCase) return;
        
        console.log('🔍 Buscando cuentas PM para:', usuarioActual.organizacionCamelCase);
        
        const cuentasPM = await CuentaPM.obtenerPorOrganizacion(usuarioActual.organizacionCamelCase);
        
        if (cuentasPM && cuentasPM.length > 0) {
            emailsAsociados = cuentasPM.map(c => c.email).filter(email => email);
            console.log('📧 Emails asociados desde Cuentas PM:', emailsAsociados);
        } else {
            console.warn('⚠️ No se encontraron cuentas PM');
        }
    } catch (error) {
        console.error('❌ Error cargando emails asociados:', error);
    }
}

// ========== CARGAR PANELES DESDE LA COLECCIÓN "paneles_info" ==========
async function cargarPanelesInfo() {
    try {
        if (!emailsAsociados || emailsAsociados.length === 0) {
            console.warn('⚠️ No hay emails asociados para buscar paneles');
            actualizarInfoPanelesUI([]);
            return;
        }
        
        console.log('🔍 Buscando paneles en colección "paneles_info" para emails:', emailsAsociados);
        
        const panelesRef = collection(db, "paneles_info");
        const q = query(panelesRef, where("email_asociado", "in", emailsAsociados.slice(0, 10)));
        
        const snapshot = await getDocs(q);
        panelesInfo = [];
        
        snapshot.forEach(doc => {
            const data = doc.data();
            panelesInfo.push({
                id: doc.id,
                serial: data.serial || '',
                alias: data.alias || '',
                email_asociado: data.email_asociado || ''
            });
        });
        
        console.log(`✅ Paneles encontrados: ${panelesInfo.length}`);
        console.log('📊 Detalle de paneles:', panelesInfo);
        
        // Actualizar UI con la información de paneles
        actualizarInfoPanelesUI(panelesInfo);
        
        return panelesInfo;
        
    } catch (error) {
        console.error('❌ Error cargando paneles_info:', error);
        actualizarInfoPanelesUI([]);
        return [];
    }
}

// ========== ACTUALIZAR UI CON INFORMACIÓN DE PANELES ==========
// ========== ACTUALIZAR UI CON INFORMACIÓN DE PANELES (VERSIÓN DESPLEGABLE) ==========
function actualizarInfoPanelesUI(paneles) {
    const cuentaInfo = document.getElementById('cuentaInfo');
    if (!cuentaInfo) return;
    
    if (!paneles || paneles.length === 0) {
        cuentaInfo.innerHTML = `
            <i class="fas fa-exclamation-triangle" style="color: #f39c12;"></i> 
            No se encontraron paneles en "paneles_info"
        `;
        return;
    }
    
    // Agrupar por email_asociado
    const panelesPorEmail = {};
    paneles.forEach(panel => {
        if (!panelesPorEmail[panel.email_asociado]) {
            panelesPorEmail[panel.email_asociado] = [];
        }
        panelesPorEmail[panel.email_asociado].push(panel);
    });
    
    let totalPaneles = paneles.length;
    let uniqueId = Date.now(); // Para IDs únicos
    
    // Construir HTML con acordeón desplegable
    let panelesHtml = `<div style="width: 100%;">`;
    
    let primerEmail = true;
    for (const [email, panelesEmail] of Object.entries(panelesPorEmail)) {
        const accordionId = `accordion-${uniqueId}-${email.replace(/[^a-zA-Z0-9]/g, '')}`;
        const isFirst = primerEmail;
        primerEmail = false;
        
        panelesHtml += `
            <div style="margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; overflow: hidden;">
                <div style="
                    background: rgba(0,0,0,0.3); 
                    padding: 8px 12px; 
                    cursor: pointer; 
                    display: flex; 
                    align-items: center; 
                    justify-content: space-between;
                    transition: all 0.2s ease;
                    font-size: 12px;
                " onclick="toggleAccordion('${accordionId}')">
                    <div>
                        <i class="fas fa-envelope" style="color: #00cfff; margin-right: 8px;"></i>
                        <strong>${escapeHTML(email)}</strong>
                        <span style="margin-left: 8px; background: rgba(0,207,255,0.2); padding: 2px 8px; border-radius: 12px; font-size: 10px;">
                            ${panelesEmail.length} panel${panelesEmail.length !== 1 ? 'es' : ''}
                        </span>
                    </div>
                    <i class="fas fa-chevron-down" style="transition: transform 0.2s ease; color: #00cfff;" id="${accordionId}-icon"></i>
                </div>
                <div id="${accordionId}" style="display: none; padding: 8px 12px; background: rgba(0,0,0,0.2);">
                    ${panelesEmail.map(panel => `
                        <div style="
                            padding: 6px 0; 
                            border-bottom: 1px solid rgba(255,255,255,0.05);
                            display: flex;
                            align-items: center;
                            gap: 10px;
                            font-size: 12px;
                        ">
                            <i class="fas fa-microchip" style="color: #00cfff; width: 20px;"></i>
                            <div style="flex: 1;">
                                <div style="color: var(--color-text-primary); font-weight: 500;">
                                    ${escapeHTML(panel.alias || panel.serial)}
                                </div>
                                ${panel.alias ? `<div style="color: var(--color-text-secondary); font-size: 10px;">Serial: ${escapeHTML(panel.serial)}</div>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    panelesHtml += `
        <div style="margin-top: 8px; color: #2ecc71; font-size: 11px; display: flex; align-items: center; gap: 8px;">
            <i class="fas fa-circle" style="font-size: 8px;"></i> 
            Tiempo Real Activo
            <span style="margin-left: auto; font-size: 10px; color: var(--color-text-secondary);">
                <i class="fas fa-chart-line"></i> Total: ${totalPaneles} paneles
            </span>
        </div>
    </div>`;
    
    cuentaInfo.innerHTML = panelesHtml;
    
    // Agregar estilos para el acordeón si no existen
    if (!document.getElementById('accordion-styles')) {
        const style = document.createElement('style');
        style.id = 'accordion-styles';
        style.textContent = `
            .accordion-hover:hover {
                background: rgba(0,207,255,0.1) !important;
            }
        `;
        document.head.appendChild(style);
    }
}

// ========== FUNCIÓN GLOBAL PARA TOGGLE DEL ACORDEÓN ==========
window.toggleAccordion = function(accordionId) {
    const element = document.getElementById(accordionId);
    const icon = document.getElementById(`${accordionId}-icon`);
    
    if (element) {
        if (element.style.display === 'none' || element.style.display === '') {
            element.style.display = 'block';
            if (icon) {
                icon.style.transform = 'rotate(180deg)';
            }
        } else {
            element.style.display = 'none';
            if (icon) {
                icon.style.transform = 'rotate(0deg)';
            }
        }
    }
}

// ========== OBTENER ALIAS DE PANEL POR SERIAL ==========
function obtenerAliasPanel(serial) {
    const panel = panelesInfo.find(p => p.serial === serial);
    return panel ? panel.alias : null;
}

// ========== INICIAR ESCUCHA EN TIEMPO REAL DE EVENTOS ==========
async function iniciarEscuchaTiempoReal() {
    try {
        if (unsubscribeEventos) {
            console.log('⚠️ Ya hay una escucha activa, no se crea otra');
            return;
        }
        
        if (!emailsAsociados || emailsAsociados.length === 0) {
            console.warn('⚠️ No hay emails para monitorear');
            todosLosEventos = [];
            actualizarEstadisticas();
            aplicarFiltros();
            return;
        }
        
        console.log('🎧 Iniciando escucha en tiempo real para emails:', emailsAsociados);
        
        mostrarLoading();
        
        const eventosRef = collection(db, "eventos");
        const emailsParaQuery = emailsAsociados.slice(0, 10);
        
        const q = query(
            eventosRef,
            where("email_asociado", "in", emailsParaQuery),
            orderBy("createdAt", "desc"),
            limit(500)
        );
        
        unsubscribeEventos = onSnapshot(q, 
            (snapshot) => {
                const cambios = snapshot.docChanges();
                console.log(`📡 Cambios detectados: ${cambios.length}`);
                
                cambios.forEach((change) => {
                    const doc = change.doc;
                    const data = doc.data();
                    
                    // Enriquecer evento con alias del panel
                    const alias = obtenerAliasPanel(data.panel_serial);
                    if (alias && !data.panel_alias) {
                        data.panel_alias = alias;
                    }
                    
                    const evento = new Evento(doc.id, { ...data, id: doc.id });
                    
                    if (change.type === "added") {
                        console.log(`🆕 NUEVO EVENTO: ${evento.description} | Panel: ${evento.panel_serial} (${evento.panel_alias || 'sin alias'})`);
                        
                        let posicionInsercion = 0;
                        while (posicionInsercion < todosLosEventos.length) {
                            const fechaExistente = todosLosEventos[posicionInsercion].createdAt;
                            const fechaNueva = evento.createdAt;
                            if (!fechaExistente || (fechaNueva && fechaNueva > fechaExistente)) {
                                break;
                            }
                            posicionInsercion++;
                        }
                        todosLosEventos.splice(posicionInsercion, 0, evento);
                        
                        if (Notification.permission === "granted" && evento.estadoEvento === 'pendiente') {
                            mostrarNotificacion(evento);
                        }
                        marcarNuevoEvento(evento.id);
                        
                    } else if (change.type === "modified") {
                        console.log(`✏️ Evento actualizado: ${evento.description}`);
                        const index = todosLosEventos.findIndex(e => e.id === evento.id);
                        if (index !== -1) {
                            todosLosEventos[index] = evento;
                        }
                        
                    } else if (change.type === "removed") {
                        console.log(`🗑️ Evento eliminado: ${change.doc.id}`);
                        todosLosEventos = todosLosEventos.filter(e => e.id !== change.doc.id);
                    }
                });
                
                actualizarEstadisticas();
                aplicarFiltros();
                
                if (!primerCargaCompletada) {
                    primerCargaCompletada = true;
                    console.log(`✅ Carga inicial completada: ${todosLosEventos.length} eventos`);
                    
                    // Mostrar estadísticas de paneles
                    const panelesEnEventos = new Set();
                    todosLosEventos.forEach(e => {
                        if (e.panel_serial) panelesEnEventos.add(e.panel_serial);
                    });
                    console.log(`📊 Paneles con eventos: ${panelesEnEventos.size}`);
                }
            },
            (error) => {
                console.error('❌ Error en escucha:', error);
                mostrarError('Error en conexión: ' + error.message);
            }
        );
        
        console.log('✅ Escucha en tiempo real establecida');
        solicitarPermisoNotificaciones();
        
    } catch (error) {
        console.error('❌ Error:', error);
        mostrarError(error.message);
    }
}

function refreshManual() {
    console.log('🔄 Refresh manual - Recargando paneles y eventos...');
    // Recargar paneles por si hay cambios
    cargarPanelesInfo().then(() => {
        aplicarFiltros();
        Swal.fire({
            icon: 'success',
            title: 'Actualizado',
            text: `Paneles: ${panelesInfo.length} | Eventos: ${todosLosEventos.length}`,
            timer: 1500,
            showConfirmButton: false
        });
    });
}

function mostrarNotificacion(evento) {
    const titulo = evento.type_id === 584 ? '🚨 ALARMA MÉDICA' : 
                   evento.esAlarma ? '🔔 NUEVA ALARMA' : '📋 Nuevo Evento';
    
    if (Notification.permission === "granted") {
        const notificacion = new Notification(titulo, {
            body: `${evento.description}\nPanel: ${evento.panel_alias || evento.panel_serial}`,
            icon: '/assets/images/logo.png',
            requireInteraction: evento.type_id === 584,
            vibrate: [200, 100, 200]
        });
        notificacion.onclick = () => { window.focus(); mostrarDetallesEvento(evento.id); };
    }
}

function solicitarPermisoNotificaciones() {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
        console.log('🔔 Notificaciones permitidas');
    } else if (Notification.permission !== "denied") {
        Notification.requestPermission();
    }
}

function marcarNuevoEvento(eventoId) {
    setTimeout(() => {
        const card = document.querySelector(`.event-card[data-event-id="${eventoId}"]`);
        if (card) {
            card.classList.add('new-event');
            setTimeout(() => card.classList.remove('new-event'), 2000);
        }
    }, 100);
}

function actualizarEstadisticas() {
    document.getElementById('statTotal').textContent = todosLosEventos.length;
    document.getElementById('statPendientes').textContent = todosLosEventos.filter(e => e.estadoEvento === 'pendiente').length;
    document.getElementById('statAlarmas').textContent = todosLosEventos.filter(e => e.esAlarma).length;
    document.getElementById('statAtendidos').textContent = todosLosEventos.filter(e => e.estadoEvento === 'atendido').length;
}

function aplicarFiltros() {
    let filtrados = [...todosLosEventos];
    
    switch (filtroActivo) {
        case 'pendiente': filtrados = filtrados.filter(e => e.estadoEvento === 'pendiente'); break;
        case 'alarma': filtrados = filtrados.filter(e => e.esAlarma); break;
        case 'atendido': filtrados = filtrados.filter(e => e.estadoEvento === 'atendido'); break;
        case 'hoy':
            const hoy = new Date(); hoy.setHours(0,0,0,0);
            filtrados = filtrados.filter(e => e.createdAt && e.createdAt >= hoy);
            break;
    }
    
    if (terminoBusqueda) {
        const termino = terminoBusqueda.toLowerCase();
        filtrados = filtrados.filter(e => 
            (e.description && e.description.toLowerCase().includes(termino)) ||
            (e.panel_serial && e.panel_serial.toLowerCase().includes(termino)) ||
            (e.panel_alias && e.panel_alias.toLowerCase().includes(termino))
        );
    }
    
    eventosFiltrados = filtrados;
    paginaActual = 1;
    renderizarEventos();
}

function renderizarEventos() {
    const timeline = document.getElementById('eventsTimeline');
    const eventCount = document.getElementById('eventCount');
    
    if (eventCount) {
        eventCount.textContent = `${eventosFiltrados.length} evento${eventosFiltrados.length !== 1 ? 's' : ''}`;
    }
    
    const totalPaginas = Math.ceil(eventosFiltrados.length / ITEMS_POR_PAGINA);
    const inicio = (paginaActual - 1) * ITEMS_POR_PAGINA;
    const fin = Math.min(inicio + ITEMS_POR_PAGINA, eventosFiltrados.length);
    const eventosPagina = eventosFiltrados.slice(inicio, fin);
    
    if (eventosFiltrados.length === 0) {
        timeline.innerHTML = `<div class="empty-state"><i class="fas fa-shield-alt" style="font-size: 48px; margin-bottom: 20px;"></i><h3>No hay eventos para mostrar</h3><p>${terminoBusqueda ? 'No se encontraron resultados' : 'Esperando eventos...'}</p></div>`;
        document.getElementById('paginationContainer').style.display = 'none';
        return;
    }
    
    let html = '';
    eventosPagina.forEach(evento => { html += renderizarEventoCard(evento); });
    timeline.innerHTML = html;
    
    renderizarPaginacion(totalPaginas);
    configurarBotonesAccion();
}

function renderizarEventoCard(evento) {
    const esMedicalAlarm = evento.type_id === 584;
    const iconoClass = esMedicalAlarm ? 'alarm' : (evento.esAlarma ? 'alarm' : 'system');
    const icono = esMedicalAlarm ? 'fa-heartbeat' : (evento.esAlarma ? 'fa-bell' : 'fa-cog');
    
    // Mostrar nombre del panel (alias si existe, sino el serial)
    const nombrePanel = evento.panel_alias ? `${evento.panel_alias}` : evento.panel_serial;
    const serialCompleto = evento.panel_serial;
    
    return `
        <div class="event-card ${evento.prioridad} ${evento.estadoEvento}" data-event-id="${evento.id}">
            <div class="event-icon ${iconoClass}"><i class="fas ${icono}"></i></div>
            <div class="event-content">
                <div class="event-header">
                    <span class="event-title">${esMedicalAlarm ? '🚨 ' : ''}${escapeHTML(evento.description || 'Evento sin descripción')}</span>
                    <span class="event-badge ${evento.estadoEvento}"><i class="fas ${evento.estadoEvento === 'pendiente' ? 'fa-clock' : (evento.estadoEvento === 'atendido' ? 'fa-check-circle' : 'fa-ban')}"></i> ${evento.estadoEvento === 'pendiente' ? 'Pendiente' : (evento.estadoEvento === 'atendido' ? 'Atendido' : 'Ignorado')}</span>
                </div>
                <div class="event-details">
                    <div class="event-detail"><i class="fas fa-microchip"></i><span title="Serial: ${escapeHTML(serialCompleto)}">${escapeHTML(nombrePanel)}</span></div>
                    <div class="event-detail"><i class="fas fa-clock"></i><span>${evento.fechaFormateada || 'Fecha no disponible'}</span></div>
                    <div class="event-detail"><i class="fas fa-envelope"></i><span>${escapeHTML(evento.email_asociado || 'N/A')}</span></div>
                </div>
                ${evento.atendido ? `<div style="margin-top: 12px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 8px;"><i class="fas fa-user-check" style="color: #2ecc71;"></i> Atendido por: ${escapeHTML(evento.nombreUsuarioAtencion)}${evento.mensajeRespuesta ? `<br><i class="fas fa-comment"></i> "${escapeHTML(evento.mensajeRespuesta)}"` : ''}</div>` : ''}
            </div>
            <div class="event-actions">
                ${evento.estadoEvento === 'pendiente' ? `<button class="event-btn success btn-atender" data-id="${evento.id}" title="Atender"><i class="fas fa-check"></i></button>` : ''}
                <button class="event-btn info btn-detalles" data-id="${evento.id}" title="Detalles"><i class="fas fa-eye"></i></button>
                ${evento.estadoEvento === 'pendiente' ? `<button class="event-btn warning btn-ignorar" data-id="${evento.id}" title="Ignorar"><i class="fas fa-ban"></i></button>` : ''}
            </div>
        </div>
    `;
}

function renderizarPaginacion(totalPaginas) {
    const container = document.getElementById('paginationContainer');
    if (totalPaginas <= 1) { container.style.display = 'none'; return; }
    
    container.style.display = 'flex';
    const inicio = (paginaActual - 1) * ITEMS_POR_PAGINA + 1;
    const fin = Math.min(paginaActual * ITEMS_POR_PAGINA, eventosFiltrados.length);
    document.getElementById('paginationInfo').textContent = `Mostrando ${inicio}-${fin} de ${eventosFiltrados.length} eventos`;
    
    let html = '';
    for (let i = 1; i <= totalPaginas; i++) {
        if (i === 1 || i === totalPaginas || (i >= paginaActual - 2 && i <= paginaActual + 2)) {
            html += `<li class="page-item ${i === paginaActual ? 'active' : ''}"><button class="page-link" data-page="${i}">${i}</button></li>`;
        } else if (i === paginaActual - 3 || i === paginaActual + 3) {
            html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
    }
    document.getElementById('pagination').innerHTML = html;
    
    document.querySelectorAll('.page-link[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
            paginaActual = parseInt(btn.dataset.page);
            renderizarEventos();
        });
    });
}

function configurarBotonesAccion() {
    document.querySelectorAll('.btn-atender').forEach(btn => btn.addEventListener('click', () => mostrarModalAtender(btn.dataset.id)));
    document.querySelectorAll('.btn-detalles').forEach(btn => btn.addEventListener('click', () => mostrarDetallesEvento(btn.dataset.id)));
    document.querySelectorAll('.btn-ignorar').forEach(btn => btn.addEventListener('click', () => mostrarModalIgnorar(btn.dataset.id)));
}

async function mostrarModalAtender(eventoId) {
    const evento = eventosFiltrados.find(e => e.id === eventoId);
    if (!evento) return;
    
    const result = await Swal.fire({
        title: evento.type_id === 584 ? '🚨 Atender Alarma Médica' : 'Atender Evento',
        html: `
            <div style="text-align: left;">
                <div style="margin-bottom: 15px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 8px;">
                    <strong>${escapeHTML(evento.description)}</strong><br>
                    <span>Panel: ${escapeHTML(evento.panel_alias || evento.panel_serial)}</span>
                </div>
                <textarea id="mensajeRespuesta" rows="3" style="width:100%; padding:12px; background:rgba(0,0,0,0.3); border:1px solid var(--color-border-light); border-radius:8px; color:white;" placeholder="Mensaje de respuesta (opcional)"></textarea>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Marcar como Atendido',
        confirmButtonColor: '#2ecc71',
        preConfirm: () => document.getElementById('mensajeRespuesta')?.value || ''
    });
    
    if (result.isConfirmed) {
        try {
            await evento.marcarComoAtendido(usuarioActual.id, usuarioActual.nombreCompleto, result.value);
            Swal.fire({ icon: 'success', title: '¡Evento atendido!', timer: 1500, showConfirmButton: false });
        } catch (error) {
            Swal.fire({ icon: 'error', title: 'Error', text: error.message });
        }
    }
}

async function mostrarDetallesEvento(eventoId) {
    const evento = eventosFiltrados.find(e => e.id === eventoId);
    if (!evento) return;
    
    Swal.fire({
        title: 'Detalles del Evento',
        html: `
            <div style="text-align:left">
                <div style="margin-bottom: 15px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 8px;">
                    <strong>${escapeHTML(evento.description)}</strong>
                </div>
                <table style="width:100%; text-align:left;">
                    <tr><td><strong>Panel:</strong></td><td>${escapeHTML(evento.panel_alias || evento.panel_serial)}</td></tr>
                    <tr><td><strong>Serial:</strong></td><td>${escapeHTML(evento.panel_serial)}</td></tr>
                    <tr><td><strong>Email:</strong></td><td>${escapeHTML(evento.email_asociado)}</td></tr>
                    <tr><td><strong>Fecha:</strong></td><td>${evento.fechaFormateada}</td></tr>
                    <tr><td><strong>Estado:</strong></td><td>${evento.estadoEvento}</td></tr>
                    <tr><td><strong>Tipo ID:</strong></td><td>${evento.type_id}</td></tr>
                </table>
                ${evento.atendido ? `<div style="margin-top:15px; padding:10px; background:rgba(46,204,113,0.1); border-radius:8px;"><strong>Atendido por:</strong> ${escapeHTML(evento.nombreUsuarioAtencion)}<br><strong>Mensaje:</strong> ${escapeHTML(evento.mensajeRespuesta || 'Sin mensaje')}</div>` : ''}
            </div>
        `,
        width: 500,
        showConfirmButton: false,
        showCloseButton: true
    });
}

async function mostrarModalIgnorar(eventoId) {
    const evento = eventosFiltrados.find(e => e.id === eventoId);
    if (!evento) return;
    
    const result = await Swal.fire({
        title: 'Ignorar Evento',
        html: `<p>¿Ignorar este evento?</p><p style="font-size:14px;">${escapeHTML(evento.description)}</p>`,
        icon: 'warning',
        input: 'text',
        inputPlaceholder: 'Motivo (opcional)',
        showCancelButton: true,
        confirmButtonText: 'Ignorar',
        confirmButtonColor: '#95a5a6'
    });
    
    if (result.isConfirmed) {
        try {
            await evento.marcarComoIgnorado(usuarioActual.id, usuarioActual.nombreCompleto, result.value || 'Evento ignorado');
            Swal.fire({ icon: 'success', title: 'Evento ignorado', timer: 1500, showConfirmButton: false });
        } catch (error) {
            Swal.fire({ icon: 'error', title: 'Error', text: error.message });
        }
    }
}

function configurarEventosUI() {
    // Filtros rápidos
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            filtroActivo = chip.dataset.filter;
            paginaActual = 1;
            aplicarFiltros();
        });
    });
    
    // Estadísticas como filtros
    document.querySelectorAll('.stat-card').forEach(card => {
        card.addEventListener('click', () => {
            const filter = card.dataset.filter;
            if (filter) {
                const chip = document.querySelector(`.filter-chip[data-filter="${filter}"]`);
                if (chip) chip.click();
            }
        });
    });
    
    // Búsqueda
    document.getElementById('btnBuscarEvento')?.addEventListener('click', () => {
        terminoBusqueda = document.getElementById('buscarEvento').value.trim();
        paginaActual = 1;
        aplicarFiltros();
    });
    
    document.getElementById('btnLimpiarBusqueda')?.addEventListener('click', () => {
        document.getElementById('buscarEvento').value = '';
        terminoBusqueda = '';
        paginaActual = 1;
        aplicarFiltros();
    });
    
    document.getElementById('buscarEvento')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            terminoBusqueda = e.target.value.trim();
            paginaActual = 1;
            aplicarFiltros();
        }
    });
    
    document.getElementById('refreshBtn')?.addEventListener('click', () => refreshManual());
}

function mostrarLoading() {
    const timeline = document.getElementById('eventsTimeline');
    if (timeline) {
        timeline.innerHTML = `<div class="loading-state"><div class="loading-spinner"></div><h3>Conectando en tiempo real...</h3><p>Cargando eventos y paneles</p></div>`;
    }
}

function mostrarError(mensaje) {
    const timeline = document.getElementById('eventsTimeline');
    if (timeline) {
        timeline.innerHTML = `<div class="error-state"><i class="fas fa-exclamation-triangle" style="font-size:48px; color:#e74c3c; margin-bottom:20px;"></i><h3>Error de conexión</h3><p>${escapeHTML(mensaje)}</p><button class="btn-buscar" onclick="location.reload()"><i class="fas fa-sync-alt"></i> Reconectar</button></div>`;
    }
}

function escapeHTML(text) {
    if (!text) return '';
    return String(text).replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

window.addEventListener('beforeunload', () => {
    if (unsubscribeEventos) {
        unsubscribeEventos();
        console.log('🔌 Escucha desconectada');
    }
});