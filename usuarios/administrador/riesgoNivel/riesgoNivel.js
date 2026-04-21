// riesgoNivel.js - Controlador para gestión de niveles de riesgo (Paginación real, CRUD)
import { RiesgoNivelManager } from '/clases/riesgoNivel.js';

// Variables globales
let riesgoManager = null;
let organizacionActual = null;
const ITEMS_POR_PAGINA = 10;
let paginaActual = 1;
let totalNiveles = 0;
let totalPaginas = 0;
let nivelesActuales = [];
let cursoresPaginacion = { ultimoDocumento: null, primerDocumento: null };
let filtrosActivos = { nombre: '' };

// Obtener usuario actual
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
        console.error('Error obteniendo usuario:', error);
        return null;
    }
}

// Cargar niveles con paginación
async function cargarNivelesPagina(pagina) {
    if (!organizacionActual?.camelCase) return;
    const tbody = document.getElementById('tablaNivelesBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;"><div class="spinner-border text-primary"></div><p>Cargando...</p></td></tr>`;

    try {
        const resultado = await riesgoManager.getNivelesPaginados(
            organizacionActual.camelCase,
            filtrosActivos,
            pagina,
            ITEMS_POR_PAGINA,
            cursoresPaginacion
        );
        cursoresPaginacion.ultimoDocumento = resultado.ultimoDocumento;
        cursoresPaginacion.primerDocumento = resultado.primerDocumento;
        nivelesActuales = resultado.niveles;
        totalNiveles = resultado.total;
        totalPaginas = resultado.totalPaginas;
        paginaActual = resultado.paginaActual;

        if (nivelesActuales.length === 0 && pagina === 1) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px;"><i class="fas fa-chart-line" style="font-size:48px; opacity:0.5;"></i><h5>No hay niveles de riesgo registrados</h5><button class="btn-nuevo" id="btnNuevoDesdeVacio" style="margin-top:16px;"><i class="fas fa-plus"></i> Crear primer nivel</button></td></tr>`;
            const btn = document.getElementById('btnNuevoDesdeVacio');
            if (btn) btn.onclick = () => abrirModalNuevo();
            return;
        }
        renderizarTabla();
        renderizarPaginacion();
    } catch (error) {
        console.error(error);
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#ef4444;">Error: ${error.message}</td></tr>`;
    }
}

function renderizarTabla() {
    const tbody = document.getElementById('tablaNivelesBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    nivelesActuales.forEach(nivel => {
        const tr = document.createElement('tr');
        const ui = nivel.toUI();
        tr.innerHTML = `
            <td data-label="ID">${ui.id}</td>
            <td data-label="Nombre"><strong>${escapeHTML(ui.nombre)}</strong></td>
            <td data-label="Color"><div style="display:flex; align-items:center; gap:8px;"><div style="width:32px; height:32px; border-radius:6px; background-color:${ui.color}; border:1px solid rgba(255,255,255,0.2);"></div><span>${ui.color}</span></div></td>
            <td data-label="Fecha Creación">${ui.fechaCreacion}</td>
            <td data-label="Acciones" class="acciones-cell">
                <button class="btn-editar" data-id="${ui.id}" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="btn-eliminar" data-id="${ui.id}" title="Eliminar"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    document.querySelectorAll('.btn-editar').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); abrirModalEditar(btn.dataset.id); }));
    document.querySelectorAll('.btn-eliminar').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); eliminarNivel(btn.dataset.id); }));
}

function renderizarPaginacion() {
    const pagination = document.getElementById('pagination');
    if (!pagination) return;
    if (totalPaginas <= 1) { pagination.innerHTML = ''; return; }
    let html = `<li class="page-item ${paginaActual === 1 ? 'disabled' : ''}"><button class="page-link" onclick="irPagina(${paginaActual - 1})" ${paginaActual === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button></li>`;
    let start = Math.max(1, paginaActual - 2);
    let end = Math.min(totalPaginas, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
    if (start > 1) html += `<li class="page-item"><button class="page-link" onclick="irPagina(1)">1</button></li>${start > 2 ? '<li class="page-item disabled"><span class="page-link">...</span></li>' : ''}`;
    for (let i = start; i <= end; i++) html += `<li class="page-item ${i === paginaActual ? 'active' : ''}"><button class="page-link" onclick="irPagina(${i})">${i}</button></li>`;
    if (end < totalPaginas) html += `${end < totalPaginas - 1 ? '<li class="page-item disabled"><span class="page-link">...</span></li>' : ''}<li class="page-item"><button class="page-link" onclick="irPagina(${totalPaginas})">${totalPaginas}</button></li>`;
    html += `<li class="page-item ${paginaActual === totalPaginas ? 'disabled' : ''}"><button class="page-link" onclick="irPagina(${paginaActual + 1})" ${paginaActual === totalPaginas ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button></li>`;
    pagination.innerHTML = html;
}

window.irPagina = async (pagina) => {
    if (pagina < 1 || pagina > totalPaginas || pagina === paginaActual) return;
    paginaActual = pagina;
    await cargarNivelesPagina(pagina);
};

function aplicarFiltros() {
    filtrosActivos.nombre = document.getElementById('filtroNombre')?.value || '';
    paginaActual = 1;
    cursoresPaginacion = { ultimoDocumento: null, primerDocumento: null };
    cargarNivelesPagina(1);
}

function limpiarFiltros() {
    document.getElementById('filtroNombre').value = '';
    filtrosActivos = { nombre: '' };
    paginaActual = 1;
    cursoresPaginacion = { ultimoDocumento: null, primerDocumento: null };
    cargarNivelesPagina(1);
}

// Modal handlers
const modal = document.getElementById('modalNivel');
const modalTitle = document.getElementById('modalTitle');
const form = document.getElementById('formNivel');
const nivelIdInput = document.getElementById('nivelId');
const nombreInput = document.getElementById('nombreNivel');
const colorInput = document.getElementById('colorNivel');
const colorPreview = document.getElementById('colorPreview');

function abrirModalNuevo() {
    nivelIdInput.value = '';
    nombreInput.value = '';
    colorInput.value = '#dc3545';
    colorPreview.style.backgroundColor = '#dc3545';
    modalTitle.innerHTML = '<i class="fas fa-chart-line"></i> Nuevo Nivel de Riesgo';
    modal.classList.add('show');
}

async function abrirModalEditar(id) {
    try {
        const nivel = await riesgoManager.obtenerNivelPorId(id, organizacionActual.camelCase);
        if (!nivel) throw new Error('Nivel no encontrado');
        nivelIdInput.value = nivel.id;
        nombreInput.value = nivel.nombre;
        colorInput.value = nivel.color;
        colorPreview.style.backgroundColor = nivel.color;
        modalTitle.innerHTML = '<i class="fas fa-edit"></i> Editar Nivel de Riesgo';
        modal.classList.add('show');
    } catch (error) {
        Swal.fire({ icon: 'error', title: 'Error', text: error.message });
    }
}

function cerrarModal() { modal.classList.remove('show'); }

async function eliminarNivel(id) {
    const result = await Swal.fire({ title: '¿Eliminar nivel?', text: 'Esta acción no se puede deshacer', icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc3545', confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar' });
    if (!result.isConfirmed) return;
    try {
        const usuario = obtenerUsuarioActual();
        await riesgoManager.eliminarNivel(id, usuario, organizacionActual.camelCase);
        Swal.fire({ icon: 'success', title: 'Eliminado', text: 'Nivel eliminado correctamente', timer: 1500, showConfirmButton: false });
        await cargarNivelesPagina(1);
    } catch (error) {
        Swal.fire({ icon: 'error', title: 'Error', text: error.message });
    }
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = nombreInput.value.trim();
    if (!nombre) { Swal.fire({ icon: 'warning', title: 'Campo requerido', text: 'El nombre es obligatorio' }); return; }
    const color = colorInput.value;
    const usuario = obtenerUsuarioActual();
    const isEditing = nivelIdInput.value !== '';
    try {
        if (isEditing) {
            await riesgoManager.actualizarNivel(nivelIdInput.value, { nombre, color }, usuario, organizacionActual.camelCase);
            Swal.fire({ icon: 'success', title: 'Actualizado', text: 'Nivel actualizado correctamente', timer: 1500, showConfirmButton: false });
        } else {
            await riesgoManager.crearNivel({ nombre, color }, usuario);
            Swal.fire({ icon: 'success', title: 'Creado', text: 'Nivel creado correctamente', timer: 1500, showConfirmButton: false });
        }
        cerrarModal();
        await cargarNivelesPagina(1);
    } catch (error) {
        Swal.fire({ icon: 'error', title: 'Error', text: error.message });
    }
});

colorInput.addEventListener('input', () => { colorPreview.style.backgroundColor = colorInput.value; });

// Event listeners
document.getElementById('btnNuevoNivel')?.addEventListener('click', abrirModalNuevo);
document.getElementById('closeModalBtn')?.addEventListener('click', cerrarModal);
document.getElementById('cancelarModalBtn')?.addEventListener('click', cerrarModal);
document.getElementById('btnFiltrar')?.addEventListener('click', aplicarFiltros);
document.getElementById('btnLimpiarFiltros')?.addEventListener('click', limpiarFiltros);
window.addEventListener('click', (e) => { if (e.target === modal) cerrarModal(); });

function escapeHTML(str) { if (!str) return ''; return str.replace(/[&<>]/g, function(m) { if (m === '&') return '&amp;'; if (m === '<') return '&lt;'; if (m === '>') return '&gt;'; return m; }); }

// Inicialización
async function init() {
    const usuario = obtenerUsuarioActual();
    if (!usuario) { console.error('No hay usuario'); return; }
    organizacionActual = { nombre: usuario.organizacion, camelCase: usuario.organizacionCamelCase };
    riesgoManager = new RiesgoNivelManager();
    await cargarNivelesPagina(1);
}

document.addEventListener('DOMContentLoaded', init);