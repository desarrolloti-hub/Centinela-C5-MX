// monitoreo.js - Controlador de la vista de monitoreo
// CON PAGINACIÓN REAL - Total real de eventos + navegación entre páginas

import { Evento } from '/clases/evento.js';
import { CuentaPM } from '/clases/cuentaPM.js';
import { db } from '/config/firebase-config.js';
import {
    collection,
    query,
    where,
    orderBy,
    limit,
    startAfter,
    getCountFromServer,
    onSnapshot,
    getDocs
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

// ========== VARIABLES GLOBALES ==========
let todosLosEventos = [];           // Eventos de la página actual
let eventosFiltrados = [];          // Eventos filtrados (para búsqueda local)
let usuarioActual = null;
let filtroActivo = 'todos';
let terminoBusqueda = '';
let unsubscribeNuevos = null;
let emailsAsociados = [];
let panelesInfo = [];
let primerCargaCompletada = false;

// ========== PAGINACIÓN REAL ==========
const ITEMS_POR_PAGINA = 10;        // 10 eventos por página
let paginaActual = 1;
let totalEventosReal = 0;            // Total REAL de eventos (desde getCountFromServer)
let totalPaginas = 0;
let ultimoDocumento = null;          // Para paginación con startAfter
let primerDocumento = null;          // Para referencia
let cargandoPagina = false;

// ========== INICIALIZACIÓN ==========
document.addEventListener('DOMContentLoaded', async function () {
    try {
        usuarioActual = obtenerUsuarioActual();
        if (!usuarioActual) throw new Error('No se encontró información del usuario');

        actualizarInfoUsuario();

        await cargarEmailsAsociados();
        await cargarPanelesInfo();

        // Cargar primera página
        await cargarPagina(1);

        // Iniciar escucha SOLO para nuevos eventos
        iniciarEscuchaNuevosEventos();

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

async function cargarEmailsAsociados() {
    try {
        if (!usuarioActual?.organizacionCamelCase) return;

        const cuentasPM = await CuentaPM.obtenerPorOrganizacion(usuarioActual.organizacionCamelCase);

        if (cuentasPM && cuentasPM.length > 0) {
            emailsAsociados = cuentasPM.map(c => c.email).filter(email => email);
        } else {
            console.warn('⚠️ No se encontraron cuentas PM');
        }
    } catch (error) {
        console.error('❌ Error cargando emails asociados:', error);
    }
}

async function cargarPanelesInfo() {
    try {
        if (!emailsAsociados || emailsAsociados.length === 0) {
            actualizarInfoPanelesUI([]);
            return;
        }

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

        actualizarInfoPanelesUI(panelesInfo);

    } catch (error) {
        console.error('❌ Error cargando paneles_info:', error);
        actualizarInfoPanelesUI([]);
    }
}

function actualizarInfoPanelesUI(paneles) {
    const cuentaInfo = document.getElementById('cuentaInfo');
    if (!cuentaInfo) return;

    if (!paneles || paneles.length === 0) {
        cuentaInfo.innerHTML = '<i class="fas fa-exclamation-triangle" style="color: #f39c12;"></i> No se encontraron paneles';
        return;
    }

    const panelesPorEmail = {};
    paneles.forEach(panel => {
        if (!panelesPorEmail[panel.email_asociado]) {
            panelesPorEmail[panel.email_asociado] = [];
        }
        panelesPorEmail[panel.email_asociado].push(panel);
    });

    let totalPaneles = paneles.length;
    let uniqueId = Date.now();

    let panelesHtml = '<div style="width: 100%;">';

    for (const [email, panelesEmail] of Object.entries(panelesPorEmail)) {
        const accordionId = 'accordion-' + uniqueId + '-' + email.replace(/[^a-zA-Z0-9]/g, '');

        panelesHtml += `
            <div style="margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; overflow: hidden;">
                <div style="background: rgba(0,0,0,0.3); padding: 8px 12px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; font-size: 12px;" onclick="toggleAccordion('${accordionId}')">
                    <div>
                        <i class="fas fa-envelope" style="color: #00cfff; margin-right: 8px;"></i>
                        <strong>${escapeHTML(email)}</strong>
                        <span style="margin-left: 8px; background: rgba(0,207,255,0.2); padding: 2px 8px; border-radius: 12px; font-size: 10px;">${panelesEmail.length}</span>
                    </div>
                    <i class="fas fa-chevron-down" style="color: #00cfff;" id="${accordionId}-icon"></i>
                </div>
                <div id="${accordionId}" style="display: none; padding: 8px 12px; background: rgba(0,0,0,0.2);">
                    ${panelesEmail.map(panel => `
                        <div style="padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; gap: 10px; font-size: 12px;">
                            <i class="fas fa-microchip" style="color: #00cfff; width: 20px;"></i>
                            <div style="flex: 1;">
                                <div style="color: var(--color-text-primary); font-weight: 500;">${escapeHTML(panel.alias || panel.serial)}</div>
                                ${panel.alias ? '<div style="color: var(--color-text-secondary); font-size: 10px;">Serial: ' + escapeHTML(panel.serial) + '</div>' : ''}
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
            <span style="margin-left: auto; font-size: 10px;">Total: ${totalPaneles} paneles</span>
        </div>
    </div>`;

    cuentaInfo.innerHTML = panelesHtml;
}

window.toggleAccordion = function (accordionId) {
    const element = document.getElementById(accordionId);
    const icon = document.getElementById(accordionId + '-icon');

    if (element) {
        if (element.style.display === 'none' || element.style.display === '') {
            element.style.display = 'block';
            if (icon) icon.style.transform = 'rotate(180deg)';
        } else {
            element.style.display = 'none';
            if (icon) icon.style.transform = 'rotate(0deg)';
        }
    }
};

function obtenerAliasPanel(serial) {
    const panel = panelesInfo.find(p => p.serial === serial);
    return panel ? panel.alias : null;
}

// ========== CONSTRUIR CONSTRAINTS PARA FILTROS ==========
function construirConstraints(emailsParaQuery) {
    const constraints = [];

    constraints.push(where("email_asociado", "in", emailsParaQuery));

    // Filtro por fecha (últimos 7 días)
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() - 7);
    constraints.push(where("createdAt", ">=", fechaLimite));

    // Filtro por estado
    if (filtroActivo === 'pendiente') {
        constraints.push(where("estadoEvento", "==", "pendiente"));
    } else if (filtroActivo === 'atendido') {
        constraints.push(where("estadoEvento", "==", "atendido"));
    } else if (filtroActivo === 'ignorado') {
        constraints.push(where("estadoEvento", "==", "ignorado"));
    } else if (filtroActivo === 'alarma') {
        constraints.push(where("type_id", "in", [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 130, 131, 132, 133, 134, 135, 584]));
    }

    constraints.push(orderBy("createdAt", "desc"));

    return constraints;
}

// ========== CARGAR PÁGINA (PAGINACIÓN REAL) ==========
async function cargarPagina(pagina) {
    if (!usuarioActual?.organizacionCamelCase || !emailsAsociados.length) return;
    if (cargandoPagina) return;

    cargandoPagina = true;

    try {
        if (pagina === 1) {
            mostrarLoading();
        }

        const eventosRef = collection(db, "eventos");
        const emailsParaQuery = emailsAsociados.slice(0, 10);
        const constraints = construirConstraints(emailsParaQuery);

        // ========== OBTENER TOTAL REAL ==========
        const countQuery = query(eventosRef, ...constraints);
        const countSnapshot = await getCountFromServer(countQuery);
        totalEventosReal = countSnapshot.data().count;
        totalPaginas = Math.ceil(totalEventosReal / ITEMS_POR_PAGINA);

        // ========== OBTENER DOCUMENTOS DE LA PÁGINA ==========
        let paginatedQuery;

        if (pagina === 1) {
            paginatedQuery = query(eventosRef, ...constraints, limit(ITEMS_POR_PAGINA));
        } else {
            if (!ultimoDocumento) {
                console.warn('⚠️ No hay último documento para paginación');
                return;
            }
            paginatedQuery = query(eventosRef, ...constraints, startAfter(ultimoDocumento), limit(ITEMS_POR_PAGINA));
        }

        const snapshot = await getDocs(paginatedQuery);

        // Actualizar cursores
        if (!snapshot.empty) {
            ultimoDocumento = snapshot.docs[snapshot.docs.length - 1];
            primerDocumento = snapshot.docs[0];
        }

        // Convertir a eventos
        const eventosPagina = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            const alias = obtenerAliasPanel(data.panel_serial);
            if (alias && !data.panel_alias) data.panel_alias = alias;
            eventosPagina.push(new Evento(doc.id, { ...data, id: doc.id }));
        });

        // 👇 Asegurar el orden descendente explícitamente
        eventosPagina.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        todosLosEventos = eventosPagina;
        paginaActual = pagina;
        primerCargaCompletada = true;

        // Actualizar UI
        actualizarEstadisticas();
        aplicarFiltros();

    } catch (error) {
        console.error('❌ Error cargando página:', error);
        mostrarError(error.message);
    } finally {
        cargandoPagina = false;
    }
}

// ========== NAVEGACIÓN ENTRE PÁGINAS ==========
window.irPagina = async function (pagina) {
    if (pagina < 1 || pagina > totalPaginas || pagina === paginaActual || cargandoPagina) return;
    await cargarPagina(pagina);
};

window.paginaAnterior = async function () {
    if (paginaActual > 1) {
        // Para ir hacia atrás necesitamos recargar desde la página 1
        // (Firestore no tiene cursor para ir hacia atrás fácilmente)
        paginaActual = 1;
        ultimoDocumento = null;
        await cargarPagina(1);
        // Navegar hasta la página deseada
        for (let i = 1; i < paginaActual; i++) {
            await cargarPagina(i + 1);
        }
    }
};

// ========== ESCUCHAR NUEVOS EVENTOS (SOLO PENDIENTES) ==========
function iniciarEscuchaNuevosEventos() {
    if (!usuarioActual?.organizacionCamelCase || !emailsAsociados.length) return;

    if (unsubscribeNuevos) unsubscribeNuevos();

    // Capturar el momento en que se inicia la escucha para evitar eventos antiguos
    const ahora = new Date();

    const escucha = Evento.escucharEventosEnTiempoReal(
        usuarioActual.organizacionCamelCase,
        async (evento) => {
            // Este callback se ejecuta para cada nuevo evento en tiempo real (solo los creados después de 'ahora')
            if (!primerCargaCompletada) return;

            // Evitar duplicados
            const existe = todosLosEventos.find(e => e.id === evento.id);
            if (existe) return;

            if (evento.estadoEvento !== 'pendiente') return;

            const alias = obtenerAliasPanel(evento.panel_serial);
            if (alias) evento.panel_alias = alias;

            todosLosEventos.push(evento);
            totalEventosReal++;
            totalPaginas = Math.ceil(totalEventosReal / ITEMS_POR_PAGINA);

            // Mantener el tamaño de la página actual (quitar el más antiguo si excede)
            if (todosLosEventos.length > ITEMS_POR_PAGINA) {
                todosLosEventos.shift();
            }

            if (Notification.permission === "granted") {
                mostrarNotificacion(evento);
            }

            todosLosEventos.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            actualizarEstadisticas();
            aplicarFiltros();
            marcarNuevoEvento(evento.id);
        },
        (error) => console.error('❌ Error en escucha de eventos:', error),
        ahora   // <-- solo eventos posteriores a este momento
    );

    escucha.subscribe().then(unsub => {
        unsubscribeNuevos = unsub;
    });

    // ========== Escuchar actualizaciones que vienen del navbar (atender/ignorar desde notificaciones) ==========
    window.addEventListener('eventoActualizado', (e) => {
        const { eventoId, estadoEvento, nombreUsuarioAtencion, mensajeRespuesta } = e.detail;
        // Buscar el evento en la página actual
        let evento = todosLosEventos.find(ev => ev.id === eventoId);
        if (!evento) {
            // Si no está en la página, recargar la página actual para traerlo
            paginaActual = 1;
            ultimoDocumento = null;
            cargarPagina(1);
            return;
        }

        evento.estadoEvento = estadoEvento;
        evento.atendido = estadoEvento === 'atendido';
        if (nombreUsuarioAtencion) evento.nombreUsuarioAtencion = nombreUsuarioAtencion;
        if (mensajeRespuesta) evento.mensajeRespuesta = mensajeRespuesta;
        actualizarEstadisticas();
        aplicarFiltros();
    });
}

// ========== ACTUALIZAR ESTADÍSTICAS (USA TOTAL REAL) ==========
function actualizarEstadisticas() {
    const statTotal = document.getElementById('statTotal');
    const statPendientes = document.getElementById('statPendientes');
    const statAlarmas = document.getElementById('statAlarmas');
    const statAtendidos = document.getElementById('statAtendidos');

    // El total mostrado es el TOTAL REAL de eventos (no solo los de la página)
    if (statTotal) statTotal.textContent = totalEventosReal;

    // Para los demás, usamos el total real que tenemos (aproximado)
    if (statPendientes) statPendientes.textContent = todosLosEventos.filter(e => e.estadoEvento === 'pendiente').length;
    if (statAlarmas) statAlarmas.textContent = todosLosEventos.filter(e => e.esAlarma).length;
    if (statAtendidos) statAtendidos.textContent = todosLosEventos.filter(e => e.estadoEvento === 'atendido').length;
}

// ========== APLICAR FILTROS (BÚSQUEDA LOCAL) ==========
function aplicarFiltros() {
    // Aseguramos que todosLosEventos esté ordenado de más nuevo a más antiguo
    todosLosEventos.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    let filtrados = [...todosLosEventos];

    // Búsqueda por texto
    if (terminoBusqueda) {
        const termino = terminoBusqueda.toLowerCase();
        filtrados = filtrados.filter(e =>
            (e.description && e.description.toLowerCase().includes(termino)) ||
            (e.panel_serial && e.panel_serial.toLowerCase().includes(termino)) ||
            (e.panel_alias && e.panel_alias.toLowerCase().includes(termino))
        );
    }

    eventosFiltrados = filtrados;
    renderizarEventos();
}

function refreshManual() {
    paginaActual = 1;
    ultimoDocumento = null;
    cargarPagina(1);
    cargarPanelesInfo();
}

function mostrarNotificacion(evento) {
    const titulo = evento.type_id === 584 ? '🚨 ALARMA MÉDICA' :
        evento.esAlarma ? '🔔 NUEVA ALARMA' : '📋 Nuevo Evento';

    if (Notification.permission === "granted") {
        const notificacion = new Notification(titulo, {
            body: evento.description + '\nPanel: ' + (evento.panel_alias || evento.panel_serial),
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
    } else if (Notification.permission !== "denied") {
        Notification.requestPermission();
    }
}

function marcarNuevoEvento(eventoId) {
    setTimeout(() => {
        const card = document.querySelector('.event-card[data-event-id="' + eventoId + '"]');
        if (card) {
            card.classList.add('new-event');
            setTimeout(() => card.classList.remove('new-event'), 2000);
        }
    }, 100);
}

function renderizarEventos() {
    const timeline = document.getElementById('eventsTimeline');
    const eventCount = document.getElementById('eventCount');

    if (eventCount) {
        eventCount.textContent = eventosFiltrados.length + ' evento' + (eventosFiltrados.length !== 1 ? 's' : '');
    }

    if (eventosFiltrados.length === 0) {
        timeline.innerHTML = '<div class="empty-state"><i class="fas fa-shield-alt" style="font-size: 48px; margin-bottom: 20px;"></i><h3>No hay eventos para mostrar</h3><p>' + (terminoBusqueda ? 'No se encontraron resultados' : 'Esperando eventos...') + '</p></div>';
        document.getElementById('paginationContainer').style.display = 'none';
        return;
    }

    let html = '';
    eventosFiltrados.forEach(evento => { html += renderizarEventoCard(evento); });
    timeline.innerHTML = html;

    renderizarPaginacion();
    configurarBotonesAccion();
}

function renderizarEventoCard(evento) {
    const esMedicalAlarm = evento.type_id === 584;
    const iconoClass = esMedicalAlarm ? 'alarm' : (evento.esAlarma ? 'alarm' : 'system');
    const icono = esMedicalAlarm ? 'fa-heartbeat' : (evento.esAlarma ? 'fa-bell' : 'fa-cog');
    const nombrePanel = evento.panel_alias || evento.panel_serial;

    let html = '<div class="event-card ' + evento.prioridad + ' ' + evento.estadoEvento + '" data-event-id="' + evento.id + '">';
    html += '<div class="event-icon ' + iconoClass + '"><i class="fas ' + icono + '"></i></div>';
    html += '<div class="event-content">';
    html += '<div class="event-header">';
    html += '<span class="event-title">' + (esMedicalAlarm ? '🚨 ' : '') + escapeHTML(evento.description || 'Evento sin descripción') + '</span>';
    html += '<span class="event-badge ' + evento.estadoEvento + '"><i class="fas ' + (evento.estadoEvento === 'pendiente' ? 'fa-clock' : (evento.estadoEvento === 'atendido' ? 'fa-check-circle' : 'fa-ban')) + '"></i> ' + (evento.estadoEvento === 'pendiente' ? 'Pendiente' : (evento.estadoEvento === 'atendido' ? 'Atendido' : 'Ignorado')) + '</span>';
    html += '</div>';
    html += '<div class="event-details">';
    html += '<div class="event-detail"><i class="fas fa-microchip"></i><span title="Serial: ' + escapeHTML(evento.panel_serial) + '">' + escapeHTML(nombrePanel) + '</span></div>';
    html += '<div class="event-detail"><i class="fas fa-clock"></i><span>' + (evento.fechaFormateada || 'Fecha no disponible') + '</span></div>';
    html += '<div class="event-detail"><i class="fas fa-envelope"></i><span>' + escapeHTML(evento.email_asociado || 'N/A') + '</span></div>';
    html += '</div>';

    if (evento.atendido) {
        html += '<div style="margin-top: 12px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 8px;"><i class="fas fa-user-check" style="color: #2ecc71;"></i> Atendido por: ' + escapeHTML(evento.nombreUsuarioAtencion);
        if (evento.mensajeRespuesta) html += '<br><i class="fas fa-comment"></i> "' + escapeHTML(evento.mensajeRespuesta) + '"';
        html += '</div>';
    }

    if (evento.estadoEvento === 'ignorado') {
        html += '<div style="margin-top: 12px; padding: 10px; background: rgba(149, 165, 166, 0.1); border-radius: 8px;">';
        html += '<i class="fas fa-ban" style="color: #95a5a6;"></i> Ignorado';
        if (evento.nombreUsuarioAtencion) {
            html += ' por: ' + escapeHTML(evento.nombreUsuarioAtencion);
        }
        if (evento.mensajeRespuesta) {
            html += '<br><i class="fas fa-comment"></i> "' + escapeHTML(evento.mensajeRespuesta) + '"';
        }
        html += '</div>';
    }

    html += '</div>';
    html += '<div class="event-actions">';
    if (evento.estadoEvento === 'pendiente') {
        html += '<button class="event-btn success btn-atender" data-id="' + evento.id + '" title="Atender"><i class="fas fa-check"></i></button>';
    }
    html += '<button class="event-btn info btn-detalles" data-id="' + evento.id + '" title="Detalles"><i class="fas fa-eye"></i></button>';
    if (evento.estadoEvento === 'pendiente') {
        html += '<button class="event-btn warning btn-ignorar" data-id="' + evento.id + '" title="Ignorar"><i class="fas fa-ban"></i></button>';
    }
    html += '</div></div>';

    return html;
}

function renderizarPaginacion() {
    const container = document.getElementById('paginationContainer');
    const paginationInfo = document.getElementById('paginationInfo');
    const pagination = document.getElementById('pagination');

    if (!container || !pagination) return;

    if (totalPaginas <= 1 && terminoBusqueda === '') {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';

    const inicio = (paginaActual - 1) * ITEMS_POR_PAGINA + 1;
    const fin = Math.min(paginaActual * ITEMS_POR_PAGINA, totalEventosReal);

    if (paginationInfo) {
        paginationInfo.textContent = 'Mostrando ' + inicio + '-' + fin + ' de ' + totalEventosReal + ' eventos';
    }

    let html = '';

    // Botón Anterior
    html += '<li class="page-item ' + (paginaActual === 1 ? 'disabled' : '') + '">';
    html += '<button class="page-link" onclick="irPagina(' + (paginaActual - 1) + ')" ' + (paginaActual === 1 ? 'disabled' : '') + '>';
    html += '<i class="fas fa-chevron-left"></i></button></li>';

    // Páginas
    const maxPagesToShow = 5;
    let startPage = Math.max(1, paginaActual - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPaginas, startPage + maxPagesToShow - 1);

    if (endPage - startPage + 1 < maxPagesToShow) {
        startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    if (startPage > 1) {
        html += '<li class="page-item"><button class="page-link" onclick="irPagina(1)">1</button></li>';
        if (startPage > 2) {
            html += '<li class="page-item disabled"><span class="page-link">...</span></li>';
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        html += '<li class="page-item ' + (i === paginaActual ? 'active' : '') + '">';
        html += '<button class="page-link" onclick="irPagina(' + i + ')">' + i + '</button></li>';
    }

    if (endPage < totalPaginas) {
        if (endPage < totalPaginas - 1) {
            html += '<li class="page-item disabled"><span class="page-link">...</span></li>';
        }
        html += '<li class="page-item"><button class="page-link" onclick="irPagina(' + totalPaginas + ')">' + totalPaginas + '</button></li>';
    }

    // Botón Siguiente
    html += '<li class="page-item ' + (paginaActual === totalPaginas || totalPaginas === 0 ? 'disabled' : '') + '">';
    html += '<button class="page-link" onclick="irPagina(' + (paginaActual + 1) + ')" ' + (paginaActual === totalPaginas || totalPaginas === 0 ? 'disabled' : '') + '>';
    html += '<i class="fas fa-chevron-right"></i></button></li>';

    pagination.innerHTML = html;
}

function configurarBotonesAccion() {
    document.querySelectorAll('.btn-atender').forEach(btn => btn.addEventListener('click', () => mostrarModalAtender(btn.dataset.id)));
    document.querySelectorAll('.btn-detalles').forEach(btn => btn.addEventListener('click', () => mostrarDetallesEvento(btn.dataset.id)));
    document.querySelectorAll('.btn-ignorar').forEach(btn => btn.addEventListener('click', () => mostrarModalIgnorar(btn.dataset.id)));
}

// ========== MODALES (SIN CAMBIOS) ==========
async function mostrarModalAtender(eventoId) {
    const evento = eventosFiltrados.find(e => e.id === eventoId);
    if (!evento) return;

    const result = await Swal.fire({
        title: evento.type_id === 584 ? '🚨 Atender Alarma Médica' : 'Atender Evento',
        html: '<div style="text-align: left;"><div style="margin-bottom: 15px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 8px;"><strong>' + escapeHTML(evento.description) + '</strong><br><span>Panel: ' + escapeHTML(evento.panel_alias || evento.panel_serial) + '</span></div><textarea id="mensajeRespuesta" rows="3" style="width:100%; padding:12px; background:rgba(0,0,0,0.3); border:1px solid var(--color-border-light); border-radius:8px; color:white;" placeholder="Mensaje de respuesta (opcional)"></textarea></div>',
        showCancelButton: true,
        confirmButtonText: 'Marcar como Atendido',
        confirmButtonColor: '#2ecc71',
        preConfirm: () => document.getElementById('mensajeRespuesta')?.value || ''
    });

    if (result.isConfirmed) {
        try {
            await evento.marcarComoAtendido(usuarioActual.id, usuarioActual.nombreCompleto, result.value);

            const index = todosLosEventos.findIndex(e => e.id === eventoId);
            if (index !== -1) {
                todosLosEventos[index].estadoEvento = 'atendido';
                todosLosEventos[index].atendido = true;
                todosLosEventos[index].nombreUsuarioAtencion = usuarioActual.nombreCompleto;
                todosLosEventos[index].mensajeRespuesta = result.value;
            }

            actualizarEstadisticas();
            aplicarFiltros();

            Swal.fire({ icon: 'success', title: '¡Evento atendido!', timer: 1500, showConfirmButton: false });
        } catch (error) {
            Swal.fire({ icon: 'error', title: 'Error', text: error.message });
        }
    }
}

async function mostrarDetallesEvento(eventoId) {
    const evento = eventosFiltrados.find(e => e.id === eventoId);
    if (!evento) return;

    let html = '<div style="text-align:left">';
    html += '<div style="margin-bottom: 15px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 8px;"><strong>' + escapeHTML(evento.description) + '</strong></div>';
    html += '<table style="width:100%; text-align:left;">';
    html += '<tr><td><strong>Panel:</strong></td><td>' + escapeHTML(evento.panel_alias || evento.panel_serial) + '</td></tr>';
    html += '<tr><td><strong>Serial:</strong></td><td>' + escapeHTML(evento.panel_serial) + '</td></tr>';
    html += '<tr><td><strong>Email:</strong></td><td>' + escapeHTML(evento.email_asociado) + '</td></tr>';
    html += '<tr><td><strong>Fecha:</strong></td><td>' + evento.fechaFormateada + '</td></tr>';
    html += '<tr><td><strong>Estado:</strong></td><td>' + evento.estadoEvento + '</td></tr>';
    html += '<tr><td><strong>Tipo ID:</strong></td><td>' + evento.type_id + '</td></tr>';
    html += '</table>';

    if (evento.atendido) {
        html += '<div style="margin-top:15px; padding:10px; background:rgba(46,204,113,0.1); border-radius:8px;"><strong>Atendido por:</strong> ' + escapeHTML(evento.nombreUsuarioAtencion) + '<br><strong>Mensaje:</strong> ' + escapeHTML(evento.mensajeRespuesta || 'Sin mensaje') + '</div>';
    }
    html += '</div>';

    Swal.fire({
        title: 'Detalles del Evento',
        html: html,
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
        html: '<p>¿Ignorar este evento?</p><p style="font-size:14px;">' + escapeHTML(evento.description) + '</p>',
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

            const index = todosLosEventos.findIndex(e => e.id === eventoId);
            if (index !== -1) {
                todosLosEventos[index].estadoEvento = 'ignorado';
                todosLosEventos[index].nombreUsuarioAtencion = usuarioActual.nombreCompleto;
                todosLosEventos[index].mensajeRespuesta = result.value || 'Evento ignorado';
            }

            actualizarEstadisticas();
            aplicarFiltros();

            Swal.fire({ icon: 'success', title: 'Evento ignorado', timer: 1500, showConfirmButton: false });
        } catch (error) {
            Swal.fire({ icon: 'error', title: 'Error', text: error.message });
        }
    }
}

function configurarEventosUI() {
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            filtroActivo = chip.dataset.filter;
            paginaActual = 1;
            ultimoDocumento = null;
            cargarPagina(1);
        });
    });

    document.querySelectorAll('.stat-card').forEach(card => {
        card.addEventListener('click', () => {
            const filter = card.dataset.filter;
            if (filter) {
                const chip = document.querySelector('.filter-chip[data-filter="' + filter + '"]');
                if (chip) chip.click();
            }
        });
    });

    const btnBuscar = document.getElementById('btnBuscarEvento');
    if (btnBuscar) {
        btnBuscar.addEventListener('click', () => {
            terminoBusqueda = document.getElementById('buscarEvento').value.trim();
            aplicarFiltros();
        });
    }

    const btnLimpiar = document.getElementById('btnLimpiarBusqueda');
    if (btnLimpiar) {
        btnLimpiar.addEventListener('click', () => {
            document.getElementById('buscarEvento').value = '';
            terminoBusqueda = '';
            aplicarFiltros();
        });
    }

    const buscarInput = document.getElementById('buscarEvento');
    if (buscarInput) {
        buscarInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                terminoBusqueda = e.target.value.trim();
                aplicarFiltros();
            }
        });
    }

    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => refreshManual());
    }
}

function mostrarLoading() {
    const timeline = document.getElementById('eventsTimeline');
    if (timeline) {
        timeline.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><h3>Cargando eventos...</h3><p>Conectando en tiempo real</p></div>';
    }
}

function mostrarError(mensaje) {
    const timeline = document.getElementById('eventsTimeline');
    if (timeline) {
        timeline.innerHTML = '<div class="error-state"><i class="fas fa-exclamation-triangle" style="font-size:48px; color:#e74c3c; margin-bottom:20px;"></i><h3>Error de conexión</h3><p>' + escapeHTML(mensaje) + '</p><button class="btn-buscar" onclick="location.reload()"><i class="fas fa-sync-alt"></i> Reconectar</button></div>';
    }
}

function escapeHTML(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

window.addEventListener('beforeunload', () => {
    if (unsubscribeNuevos) {
        unsubscribeNuevos();
    }
});