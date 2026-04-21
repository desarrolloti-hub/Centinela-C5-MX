import { RiesgoNivelManager } from '/clases/riesgoNivel.js';

const ITEMS_POR_PAGINA = 10;
let manager = null;
let organizacionActual = null;
let paginaActual = 1;
let totalPaginas = 0;
let filtrosActivos = { nombre: '' };
let cursores = { ultimoDocumento: null };

function obtenerUsuarioActual() {
    try {
        const adminInfo = localStorage.getItem('adminInfo');
        if (adminInfo) {
            const data = JSON.parse(adminInfo);
            return {
                id: data.id || data.uid,
                nombreCompleto: data.nombreCompleto || 'Administrador',
                organizacion: data.organizacion,
                organizacionCamelCase: data.organizacionCamelCase
            };
        }
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        return {
            id: userData.uid || userData.id,
            nombreCompleto: userData.nombreCompleto || 'Usuario',
            organizacion: userData.organizacion,
            organizacionCamelCase: userData.organizacionCamelCase
        };
    } catch { return null; }
}

async function cargarPagina(pagina) {
    if (!organizacionActual?.camelCase) return;
    const tbody = document.getElementById('tablaNivelesBody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Cargando...</td></tr>';

    const resultado = await manager.getNivelesPaginados(
        organizacionActual.camelCase,
        filtrosActivos,
        pagina,
        ITEMS_POR_PAGINA,
        cursores
    );

    cursores.ultimoDocumento = resultado.ultimoDocumento;
    paginaActual = resultado.paginaActual;
    totalPaginas = resultado.totalPaginas;

    const info = document.getElementById('paginationInfo');
    const inicio = (paginaActual-1)*ITEMS_POR_PAGINA + 1;
    const fin = Math.min(inicio + resultado.niveles.length -1, resultado.total);
    info.textContent = `Mostrando ${inicio}-${fin} de ${resultado.total} niveles`;

    renderizarTabla(resultado.niveles);
    renderizarPaginacion();
}

function renderizarTabla(niveles) {
    const tbody = document.getElementById('tablaNivelesBody');
    tbody.innerHTML = '';
    if (niveles.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No hay niveles de riesgo registrados</td></tr>';
        return;
    }
    niveles.forEach(n => {
        const row = tbody.insertRow();
        // Nombre
        row.insertCell(0).textContent = n.nombre;
        // Color
        const colorCell = row.insertCell(1);
        colorCell.innerHTML = `<div style="display:flex; align-items:center; gap:8px;"><div style="width:30px; height:30px; background-color:${n.color}; border-radius:4px; border:1px solid #ccc;"></div><span>${n.color}</span></div>`;
        // Fecha
        row.insertCell(2).textContent = n.getFechaCreacionFormateada ? n.getFechaCreacionFormateada() : 'N/D';
        // Acciones
        const actions = row.insertCell(3);
        actions.innerHTML = `
            <div class="btn-group">
                <button class="btn-editar" data-id="${n.id}" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="btn-eliminar" data-id="${n.id}" title="Eliminar"><i class="fas fa-trash"></i></button>
            </div>
        `;
    });
    document.querySelectorAll('.btn-editar').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.location.href = `/usuarios/administrador/CreaRiesgoNivel/CreaRiesgoNivel.html?id=${btn.dataset.id}`;
        });
    });
    document.querySelectorAll('.btn-eliminar').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const nivel = niveles.find(n => n.id === id);
            const nombreNivel = nivel ? nivel.nombre : id;
            const result = await Swal.fire({
                title: '¿Eliminar nivel?',
                text: `¿Estás seguro de eliminar "${nombreNivel}"?`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#dc3545',
                confirmButtonText: 'Sí, eliminar',
                cancelButtonText: 'Cancelar'
            });
            if (result.isConfirmed) {
                try {
                    const usuario = obtenerUsuarioActual();
                    await manager.eliminarNivel(id, organizacionActual.camelCase, usuario);
                    await Swal.fire('Eliminado', 'El nivel se eliminó correctamente', 'success');
                    await cargarPagina(paginaActual);
                } catch (error) {
                    Swal.fire('Error', error.message, 'error');
                }
            }
        });
    });
}

function renderizarPaginacion() {
    const pagination = document.getElementById('pagination');
    if (totalPaginas <= 1) { pagination.innerHTML = ''; return; }
    let html = '';
    html += `<li class="page-item ${paginaActual===1?'disabled':''}"><button class="page-link" onclick="window.irPagina(${paginaActual-1})"><i class="fas fa-chevron-left"></i></button></li>`;
    for (let i=1; i<=totalPaginas; i++) {
        if (i===1 || i===totalPaginas || (i>=paginaActual-2 && i<=paginaActual+2)) {
            html += `<li class="page-item ${i===paginaActual?'active':''}"><button class="page-link" onclick="window.irPagina(${i})">${i}</button></li>`;
        } else if (i===paginaActual-3 || i===paginaActual+3) {
            html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
    }
    html += `<li class="page-item ${paginaActual===totalPaginas?'disabled':''}"><button class="page-link" onclick="window.irPagina(${paginaActual+1})"><i class="fas fa-chevron-right"></i></button></li>`;
    pagination.innerHTML = html;
}

window.irPagina = async (pagina) => {
    if (pagina<1 || pagina>totalPaginas || pagina===paginaActual) return;
    await cargarPagina(pagina);
};

async function aplicarFiltros() {
    filtrosActivos.nombre = document.getElementById('filtroNombre').value.trim();
    paginaActual = 1;
    cursores.ultimoDocumento = null;
    await cargarPagina(1);
}

function limpiarFiltros() {
    document.getElementById('filtroNombre').value = '';
    filtrosActivos.nombre = '';
    paginaActual = 1;
    cursores.ultimoDocumento = null;
    cargarPagina(1);
}

async function inicializar() {
    const usuario = obtenerUsuarioActual();
    if (!usuario?.organizacionCamelCase) {
        console.error('No se pudo obtener la organización');
        return;
    }
    organizacionActual = { camelCase: usuario.organizacionCamelCase };
    manager = new RiesgoNivelManager();
    document.getElementById('btnFiltrar').addEventListener('click', aplicarFiltros);
    document.getElementById('btnLimpiarFiltros').addEventListener('click', limpiarFiltros);
    await cargarPagina(1);
}

document.addEventListener('DOMContentLoaded', inicializar);