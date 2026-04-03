// ========== VARIABLES GLOBALES ==========
let sucursalManager = null;
let usuarioActual = null;
let historialManager = null;

// Configuración de paginación REAL (como en incidencias)
const ITEMS_POR_PAGINA = 10;
let paginaActual = 1;
let totalSucursales = 0;
let totalPaginas = 0;
let sucursalesActuales = [];
let cursoresPaginacion = {
    ultimoDocumento: null,
    primerDocumento: null
};

// Filtros activos
let terminoBusqueda = '';

// ========== INICIALIZACIÓN ==========
document.addEventListener('DOMContentLoaded', async function() {    
    try {
        await inicializarHistorial();
        
        const { SucursalManager } = await import('/clases/sucursal.js');
        
        sucursalManager = new SucursalManager();
        
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        usuarioActual = obtenerUsuarioActual();
        
        if (!usuarioActual) {
            console.warn('No hay información de usuario, usando valores por defecto');
            usuarioActual = {
                id: `usuario_${Date.now()}`,
                nombreCompleto: 'Usuario',
                organizacion: 'Mi Organización',
                organizacionCamelCase: 'miOrganizacion',
                correoElectronico: 'usuario@ejemplo.com'
            };
        }
        
        localStorage.setItem('userInfo', JSON.stringify({
            id: usuarioActual.id,
            nombreCompleto: usuarioActual.nombreCompleto,
            organizacion: usuarioActual.organizacion,
            organizacionCamelCase: usuarioActual.organizacionCamelCase,
            correoElectronico: usuarioActual.correoElectronico,
            timestamp: new Date().toISOString()
        }));
        
        await cargarSucursalesPagina(1);
        configurarBusqueda();
        setupEvents();
        
        await registrarAccesoVistaSucursales();
        
    } catch (error) {
        console.error('❌ Error inicializando:', error);
        showError(error.message || 'Error al cargar la página');
    }
});

// ========== INICIALIZAR HISTORIAL ==========
async function inicializarHistorial() {
    try {
        const { HistorialUsuarioManager } = await import('/clases/historialUsuario.js');
        historialManager = new HistorialUsuarioManager();
        console.log('📋 HistorialManager inicializado para sucursales');
    } catch (error) {
        console.error('Error inicializando historialManager:', error);
    }
}

// ========== REGISTRAR ACCESO A VISTA ==========
async function registrarAccesoVistaSucursales() {
    if (!historialManager) return;
    
    try {
        await historialManager.registrarActividad({
            usuario: usuarioActual,
            tipo: 'leer',
            modulo: 'sucursales',
            descripcion: 'Accedió a la vista de sucursales',
            detalles: {
                totalSucursales: totalSucursales || 0,
                organizacion: usuarioActual?.organizacion
            }
        });
        console.log('✅ Acceso a sucursales registrado en bitácora');
    } catch (error) {
        console.error('Error registrando acceso a sucursales:', error);
    }
}

// ========== REGISTRAR VISUALIZACIÓN DE SUCURSAL ==========
async function registrarVisualizacionSucursal(sucursal) {
    if (!historialManager) return;
    
    try {
        const regionInfo = await sucursal.getRegionInfo();
        
        await historialManager.registrarActividad({
            usuario: usuarioActual,
            tipo: 'leer',
            modulo: 'sucursales',
            descripcion: `Visualizó detalles de sucursal: ${sucursal.nombre}`,
            detalles: {
                sucursalId: sucursal.id,
                sucursalNombre: sucursal.nombre,
                sucursalTipo: sucursal.tipo,
                sucursalRegion: regionInfo.nombre,
                sucursalCiudad: sucursal.ciudad,
                fechaVisualizacion: new Date().toISOString()
            }
        });
        console.log(`✅ Visualización de sucursal "${sucursal.nombre}" registrada en bitácora`);
    } catch (error) {
        console.error('Error registrando visualización de sucursal:', error);
    }
}

// ========== REGISTRAR ELIMINACIÓN DE SUCURSAL ==========
async function registrarEliminacionSucursal(sucursal) {
    if (!historialManager) return;
    
    try {
        const regionInfo = await sucursal.getRegionInfo();
        
        await historialManager.registrarActividad({
            usuario: usuarioActual,
            tipo: 'eliminar',
            modulo: 'sucursales',
            descripcion: `Eliminó sucursal: ${sucursal.nombre}`,
            detalles: {
                sucursalId: sucursal.id,
                sucursalNombre: sucursal.nombre,
                sucursalTipo: sucursal.tipo,
                sucursalRegion: regionInfo.nombre,
                sucursalDireccion: sucursal.direccion,
                sucursalCiudad: sucursal.ciudad,
                fechaEliminacion: new Date().toISOString()
            }
        });
        console.log(`✅ Eliminación de sucursal "${sucursal.nombre}" registrada en bitácora`);
    } catch (error) {
        console.error('Error registrando eliminación de sucursal:', error);
    }
}

// ========== OBTENER USUARIO ACTUAL ==========
function obtenerUsuarioActual() {
    try {
        const adminInfo = JSON.parse(localStorage.getItem('adminInfo') || '{}');
        if (adminInfo && Object.keys(adminInfo).length > 0) {
            return {
                id: adminInfo.id || adminInfo.uid || `admin_${Date.now()}`,
                nombreCompleto: adminInfo.nombreCompleto || 'Administrador',
                organizacion: adminInfo.organizacion || 'Mi Organización',
                organizacionCamelCase: adminInfo.organizacionCamelCase || generarCamelCase(adminInfo.organizacion),
                correoElectronico: adminInfo.correoElectronico || ''
            };
        }

        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        if (userData && Object.keys(userData).length > 0) {
            return {
                id: userData.uid || userData.id || `user_${Date.now()}`,
                nombreCompleto: userData.nombreCompleto || userData.nombre || 'Usuario',
                organizacion: userData.organizacion || userData.empresa || 'Mi Organización',
                organizacionCamelCase: userData.organizacionCamelCase || generarCamelCase(userData.organizacion || userData.empresa),
                correoElectronico: userData.correo || userData.email || ''
            };
        }

        return null;

    } catch (error) {
        console.error('Error obteniendo usuario:', error);
        return null;
    }
}

function generarCamelCase(texto) {
    if (!texto || typeof texto !== 'string') return 'miOrganizacion';
    return texto
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+(.)/g, (match, chr) => chr.toUpperCase())
        .replace(/[^a-zA-Z0-9]/g, '');
}

// ========== CONFIGURAR BÚSQUEDA ==========
function configurarBusqueda() {
    const inputBuscar = document.getElementById('buscarSucursal');
    const btnBuscar = document.getElementById('btnBuscarSucursal');
    const btnLimpiar = document.getElementById('btnLimpiarBusqueda');

    if (btnBuscar) {
        btnBuscar.addEventListener('click', () => {
            terminoBusqueda = inputBuscar?.value.trim() || '';
            paginaActual = 1;
            cursoresPaginacion = { ultimoDocumento: null, primerDocumento: null };
            cargarSucursalesPagina(1);
        });
    }

    if (btnLimpiar) {
        btnLimpiar.addEventListener('click', () => {
            if (inputBuscar) inputBuscar.value = '';
            terminoBusqueda = '';
            paginaActual = 1;
            cursoresPaginacion = { ultimoDocumento: null, primerDocumento: null };
            cargarSucursalesPagina(1);
        });
    }

    if (inputBuscar) {
        let timeoutId;
        inputBuscar.addEventListener('input', (e) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                terminoBusqueda = e.target.value.trim();
                paginaActual = 1;
                cursoresPaginacion = { ultimoDocumento: null, primerDocumento: null };
                cargarSucursalesPagina(1);
            }, 300);
        });

        inputBuscar.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                terminoBusqueda = e.target.value.trim();
                paginaActual = 1;
                cursoresPaginacion = { ultimoDocumento: null, primerDocumento: null };
                cargarSucursalesPagina(1);
            }
        });
    }
}

// ========== CARGAR SUCURSALES CON PAGINACIÓN REAL ==========
async function cargarSucursalesPagina(pagina) {
    if (!usuarioActual?.organizacionCamelCase) {
        console.error('No hay organización configurada');
        return;
    }

    try {
        const tbody = document.getElementById('branchesTableBody');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center; padding:40px;">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Cargando...</span>
                    </div>
                    <p style="margin-top: 12px; color: var(--color-text-secondary);">Cargando sucursales...</p>
                </td>
            </tr>
        `;

        // Construir filtros para búsqueda
        let filtros = {};
        if (terminoBusqueda && terminoBusqueda.length >= 2) {
            filtros.termino = terminoBusqueda;
        }

        // Obtener sucursales paginadas usando el manager
        const resultado = await sucursalManager.getSucursalesPaginadas(
            usuarioActual.organizacionCamelCase,
            filtros,
            pagina,
            ITEMS_POR_PAGINA,
            cursoresPaginacion
        );

        cursoresPaginacion.ultimoDocumento = resultado.ultimoDocumento;
        cursoresPaginacion.primerDocumento = resultado.primerDocumento;

        sucursalesActuales = resultado.sucursales;
        totalSucursales = resultado.total;
        totalPaginas = resultado.totalPaginas;
        paginaActual = resultado.paginaActual;

        if (sucursalesActuales.length === 0 && pagina === 1) {
            if (!terminoBusqueda) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" class="empty-state">
                            <div class="empty-state-content">
                                <i class="fas fa-store-alt"></i>
                                <h3>No hay sucursales en ${escapeHTML(usuarioActual?.organizacion || 'tu organización')}</h3>
                                <p>Comienza agregando tu primera sucursal</p>
                                <button class="add-first-btn" id="addFirstBranch">
                                    <i class="fas fa-plus-circle"></i> CREAR PRIMERA SUCURSAL
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
                document.getElementById('addFirstBranch')?.addEventListener('click', () => {
                    window.location.href = '../crearSucursales/crearSucursales.html';
                });
            } else {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" class="empty-state">
                            <div class="empty-state-content">
                                <i class="fas fa-search"></i>
                                <h3>No se encontraron sucursales</h3>
                                <p>No hay resultados para "${escapeHTML(terminoBusqueda)}"</p>
                            </div>
                        </td>
                    </tr>
                `;
            }
            renderizarPaginacion();
            return;
        }

        renderizarSucursales();
        renderizarPaginacion();

    } catch (error) {
        console.error('Error cargando sucursales:', error);
        mostrarError('Error al cargar sucursales: ' + error.message);
    }
}

// ========== IR A PÁGINA ==========
window.irPaginaSucursal = async function (pagina) {
    if (pagina < 1 || pagina > totalPaginas || pagina === paginaActual) return;

    try {
        const tbody = document.getElementById('branchesTableBody');
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

        let filtros = {};
        if (terminoBusqueda && terminoBusqueda.length >= 2) {
            filtros.termino = terminoBusqueda;
        }

        let resultado;
        if (pagina > paginaActual) {
            resultado = await sucursalManager.getSucursalesPaginadas(
                usuarioActual.organizacionCamelCase,
                filtros,
                pagina,
                ITEMS_POR_PAGINA,
                cursoresPaginacion
            );
        } else {
            resultado = await sucursalManager.getSucursalesPaginaEspecifica(
                usuarioActual.organizacionCamelCase,
                filtros,
                pagina,
                ITEMS_POR_PAGINA
            );
        }

        cursoresPaginacion.ultimoDocumento = resultado.ultimoDocumento;
        cursoresPaginacion.primerDocumento = resultado.primerDocumento;
        sucursalesActuales = resultado.sucursales;
        totalSucursales = resultado.total;
        totalPaginas = resultado.totalPaginas;
        paginaActual = pagina;

        renderizarSucursales();
        renderizarPaginacion();

    } catch (error) {
        console.error('Error navegando a página:', error);
        mostrarError('Error al cambiar de página: ' + error.message);
    }
};

// ========== RENDERIZAR SUCURSALES ==========
function renderizarSucursales() {
    const tbody = document.getElementById('branchesTableBody');
    if (!tbody) return;

    const paginationInfo = document.getElementById('paginationInfo');
    if (paginationInfo) {
        const inicio = (paginaActual - 1) * ITEMS_POR_PAGINA + 1;
        const fin = Math.min(inicio + sucursalesActuales.length - 1, totalSucursales);

        if (totalSucursales > 0) {
            paginationInfo.textContent = `Mostrando ${inicio}-${fin} de ${totalSucursales} sucursales`;
        } else {
            paginationInfo.textContent = `Mostrando 0 de 0 sucursales`;
        }
    }

    tbody.innerHTML = '';

    sucursalesActuales.forEach(suc => {
        const row = document.createElement('tr');
        
        let fechaCreacion = 'No disponible';
        if (suc.fechaCreacion) {
            try {
                if (suc.fechaCreacion.toDate) {
                    fechaCreacion = suc.fechaCreacion.toDate().toLocaleDateString('es-MX', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    });
                } else if (suc.fechaCreacion instanceof Date) {
                    fechaCreacion = suc.fechaCreacion.toLocaleDateString('es-MX', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    });
                } else if (typeof suc.fechaCreacion === 'string') {
                    fechaCreacion = new Date(suc.fechaCreacion).toLocaleDateString('es-MX', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    });
                } else if (suc.fechaCreacion && typeof suc.fechaCreacion === 'object' && 'seconds' in suc.fechaCreacion) {
                    fechaCreacion = new Date(suc.fechaCreacion.seconds * 1000).toLocaleDateString('es-MX', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    });
                }
            } catch (e) {
                fechaCreacion = 'Fecha inválida';
            }
        }
        
        const ubicacionPartes = [];
        if (suc.direccion) ubicacionPartes.push(suc.direccion);
        if (suc.ciudad) ubicacionPartes.push(suc.ciudad);
        if (suc.estado) ubicacionPartes.push(suc.estado);
        const ubicacionCompleta = ubicacionPartes.join(', ') || 'No disponible';
        
        let telefonoFormateado = suc.contacto || 'No disponible';
        if (suc.contacto) {
            const telefono = suc.contacto.replace(/\D/g, '');
            if (telefono.length === 10) {
                telefonoFormateado = `${telefono.slice(0,3)} ${telefono.slice(3,6)} ${telefono.slice(6)}`;
            }
        }
        
        const tipoDisplay = suc.tipo ? suc.tipo.replace(/_/g, ' ').toUpperCase() : 'No especificado';
        
        row.innerHTML = `
            <td data-label="NOMBRE">
                <div class="branch-info">
                    <strong>${escapeHTML(suc.nombre)}</strong>
                </div>
            </td>
            <td data-label="TIPO">
                <span class="tipo-badge">
                    ${escapeHTML(tipoDisplay)}
                </span>
             </td>
            <td data-label="UBICACIÓN">
                <div class="ubicacion-info">
                    ${escapeHTML(ubicacionCompleta)}
                </div>
             </td>
            <td data-label="CONTACTO">
                <div class="contacto-info">
                    ${escapeHTML(telefonoFormateado)}
                </div>
             </td>
            <td data-label="FECHA CREACIÓN">
                <span style="color: var(--color-text-dim);">
                    ${escapeHTML(fechaCreacion)}
                </span>
             </td>
            <td data-label="ACCIONES">
                <div class="btn-group">
                    <button type="button" class="btn btn-view" data-action="view" data-branch-id="${suc.id}" data-branch-name="${escapeHTML(suc.nombre)}" title="Ver detalles">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button type="button" class="btn btn-edit" data-action="edit" data-branch-id="${suc.id}" data-branch-name="${escapeHTML(suc.nombre)}" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button type="button" class="btn btn-delete" data-action="delete" data-branch-id="${suc.id}" data-branch-name="${escapeHTML(suc.nombre)}" title="Eliminar">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
             </td>
        `;
        
        tbody.appendChild(row);
    });
}

// ========== RENDERIZAR PAGINACIÓN ==========
function renderizarPaginacion() {
    const pagination = document.getElementById('pagination');
    if (!pagination) return;

    if (totalPaginas <= 1) {
        pagination.innerHTML = '';
        const paginacionContainer = document.querySelector('.pagination-container');
        if (paginacionContainer) paginacionContainer.style.display = 'none';
        return;
    }

    const paginacionContainer = document.querySelector('.pagination-container');
    if (paginacionContainer) paginacionContainer.style.display = 'flex';

    let html = '';

    html += `
        <li class="page-item ${paginaActual === 1 ? 'disabled' : ''}">
            <button class="page-link" onclick="irPaginaSucursal(${paginaActual - 1})" ${paginaActual === 1 ? 'disabled' : ''}>
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
                <button class="page-link" onclick="irPaginaSucursal(1)">1</button>
            </li>
            ${startPage > 2 ? '<li class="page-item disabled"><span class="page-link">...</span></li>' : ''}
        `;
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `
            <li class="page-item ${i === paginaActual ? 'active' : ''}">
                <button class="page-link" onclick="irPaginaSucursal(${i})">${i}</button>
            </li>
        `;
    }

    if (endPage < totalPaginas) {
        html += `
            ${endPage < totalPaginas - 1 ? '<li class="page-item disabled"><span class="page-link">...</span></li>' : ''}
            <li class="page-item">
                <button class="page-link" onclick="irPaginaSucursal(${totalPaginas})">${totalPaginas}</button>
            </li>
        `;
    }

    html += `
        <li class="page-item ${paginaActual === totalPaginas || totalPaginas === 0 ? 'disabled' : ''}">
            <button class="page-link" onclick="irPaginaSucursal(${paginaActual + 1})" ${paginaActual === totalPaginas || totalPaginas === 0 ? 'disabled' : ''}>
                <i class="fas fa-chevron-right"></i>
            </button>
        </li>
    `;

    pagination.innerHTML = html;
}

// ========== CONFIGURAR EVENTOS ==========
function setupEvents() {
    const addBtn = document.getElementById('addBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            window.location.href = '../crearSucursales/crearSucursales.html';
        });
    }
    
    const table = document.querySelector('.table');
    if (table) {
        table.addEventListener('click', async (e) => {
            const button = e.target.closest('.btn');
            if (!button) return;
            
            const action = button.getAttribute('data-action');
            const branchId = button.getAttribute('data-branch-id');
            const branchName = button.getAttribute('data-branch-name');
            
            if (action === 'edit') {
                await editBranch(branchId, branchName);
            } 
            else if (action === 'view') {
                await viewBranchDetails(branchId, branchName);
            }
            else if (action === 'delete') {
                await deleteBranch(branchId, branchName);
            }
        });
    }
}

// ========== EDITAR SUCURSAL ==========
async function editBranch(branchId, branchName) {    
    const selectedBranch = {
        id: branchId,
        nombre: branchName,
        organizacion: usuarioActual.organizacion,
        organizacionCamelCase: usuarioActual.organizacionCamelCase,
        fechaSeleccion: new Date().toISOString(),
        usuario: usuarioActual.nombreCompleto
    };
    
    localStorage.setItem('selectedBranch', JSON.stringify(selectedBranch));
    window.location.href = `../editarSucursales/editarSucursales.html?id=${branchId}&org=${usuarioActual.organizacionCamelCase}`;
}

// ========== VER DETALLES DE SUCURSAL ==========
async function viewBranchDetails(branchId, branchName) {
    try {
        const sucursal = await sucursalManager.getSucursalById(branchId, usuarioActual.organizacionCamelCase);
        
        if (!sucursal) {
            throw new Error('Sucursal no encontrada');
        }
        
        await registrarVisualizacionSucursal(sucursal);
        await showBranchDetails(sucursal, branchName);
        
    } catch (error) {
        console.error('Error obteniendo detalles:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudieron obtener los detalles de la sucursal'
        });
    }
}

// ========== MOSTRAR DETALLES EN MODAL ==========
async function showBranchDetails(sucursal, branchName) {
    try {
        Swal.fire({
            title: 'Cargando detalles...',
            html: '<i class="fas fa-spinner fa-spin" style="font-size: 48px;"></i>',
            allowOutsideClick: false,
            showConfirmButton: false
        });
        
        const regionInfo = await sucursal.getRegionInfo();
        const contactoFormateado = sucursal.getContactoFormateado();
        const ubicacionCompleta = sucursal.getUbicacionCompleta();
        const tipoDisplay = sucursal.tipo ? sucursal.tipo.replace(/_/g, ' ').toUpperCase() : 'No especificado';
        const coordenadas = sucursal.getCoordenadas();
        
        Swal.close();
        
        Swal.fire({
            title: sucursal.nombre,
            html: `
                <div style="text-align: left;">
                    <div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid var(--color-border-light);">
                        <h4 style="color: var(--color-accent-primary); margin: 0 0 10px 0; font-size: 0.9rem; text-transform: uppercase;">INFORMACIÓN GENERAL</h4>
                        <p style="margin: 8px 0;"><strong style="color: var(--color-accent-primary);">Tipo:</strong> <span style="color: var(--color-text-primary);">${escapeHTML(tipoDisplay)}</span></p>
                        <p style="margin: 8px 0;"><strong style="color: var(--color-accent-primary);">Región:</strong> <span style="color: var(--color-text-primary);">${escapeHTML(regionInfo.nombre)}</span></p>
                        <p style="margin: 8px 0;"><strong style="color: var(--color-accent-primary);">Contacto:</strong> <span style="color: var(--color-text-primary);">${escapeHTML(contactoFormateado)}</span></p>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <h4 style="color: var(--color-accent-primary); margin: 0 0 10px 0; font-size: 0.9rem; text-transform: uppercase;">UBICACIÓN</h4>
                        <p style="margin: 8px 0;"><strong style="color: var(--color-accent-primary);">Dirección:</strong> <span style="color: var(--color-text-primary);">${escapeHTML(ubicacionCompleta)}</span></p>
                        <p style="margin: 8px 0;"><strong style="color: var(--color-accent-primary);">Coordenadas:</strong> <span style="color: var(--color-text-primary);">${escapeHTML(coordenadas.lat)}, ${escapeHTML(coordenadas.lng)}</span></p>
                    </div>
                </div>
            `,
            width: 600,
            showConfirmButton: true,
            showCancelButton: true,
            confirmButtonText: 'EDITAR',
            cancelButtonText: 'CERRAR',
            reverseButtons: false,
            background: 'var(--color-bg-secondary)',
            color: 'var(--color-text-primary)'
        }).then((result) => {
            if (result.isConfirmed) {
                editBranch(sucursal.id, sucursal.nombre);
            }
        });
        
    } catch (error) {
        console.error('Error mostrando detalles:', error);
        Swal.close();
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudieron cargar los detalles completos de la sucursal'
        });
    }
}

// ========== ELIMINAR SUCURSAL ==========
async function deleteBranch(branchId, branchName) {
    let sucursalCompleta = null;
    try {
        sucursalCompleta = await sucursalManager.getSucursalById(branchId, usuarioActual.organizacionCamelCase);
    } catch (error) {
        sucursalCompleta = { id: branchId, nombre: branchName };
    }
    
    const confirmResult = await Swal.fire({
        title: '¿Eliminar sucursal?',
        html: `
            <div class="delete-confirmation">
                <p style="color: var(--color-text-primary); margin: 10px 0; font-size: 1.1rem;">
                    <strong style="color: #ff4d4d;">"${escapeHTML(branchName)}"</strong>
                </p>
                <div class="warning-message" style="background: rgba(255, 77, 77, 0.1); padding: 15px; border-radius: 8px; margin: 15px 0;">
                    <i class="fas fa-exclamation-triangle" style="color: #ff4d4d; margin-right: 8px;"></i>
                    <strong style="color: #ff4d4d;">Advertencia:</strong> Esta acción no se puede deshacer.
                </div>
            </div>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'ELIMINAR',
        cancelButtonText: 'CANCELAR',
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        reverseButtons: false,
        focusCancel: true,
        background: 'var(--color-bg-secondary)',
        color: 'var(--color-text-primary)'
    });

    if (!confirmResult.isConfirmed) return;

    Swal.fire({
        title: 'Eliminando sucursal...',
        html: '<i class="fas fa-spinner fa-spin" style="font-size: 48px; color: #ff4d4d;"></i>',
        allowOutsideClick: false,
        showConfirmButton: false,
        background: 'var(--color-bg-secondary)'
    });

    try {
        await sucursalManager.eliminarSucursal(branchId, usuarioActual.organizacionCamelCase);
        await registrarEliminacionSucursal(sucursalCompleta);
        
        Swal.close();
        
        await Swal.fire({
            icon: 'success',
            title: '¡Sucursal eliminada!',
            html: `La sucursal <strong style="color: #ff4d4d;">"${escapeHTML(branchName)}"</strong> ha sido eliminada correctamente.`,
            timer: 2000,
            showConfirmButton: false,
            background: 'var(--color-bg-secondary)',
            color: 'var(--color-text-primary)'
        });
        
        cursoresPaginacion = { ultimoDocumento: null, primerDocumento: null };
        await cargarSucursalesPagina(1);
        
    } catch (error) {
        console.error('❌ Error eliminando sucursal:', error);
        Swal.close();
        
        Swal.fire({
            icon: 'error',
            title: 'Error al eliminar',
            text: error.message || 'Ocurrió un error al eliminar la sucursal. Por favor intenta de nuevo.',
            confirmButtonText: 'ENTENDIDO',
            background: 'var(--color-bg-secondary)',
            color: 'var(--color-text-primary)'
        });
    }
}

// ========== ESTADOS DE CARGA Y ERROR ==========
function showLoadingState() {
    const tbody = document.getElementById('branchesTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="loading-state">
                <div class="loading-content">
                    <div class="loading-spinner"></div>
                    <h3>Cargando sucursales...</h3>
                    <p>Obteniendo datos de Firebase</p>
                </div>
            </td>
        </tr>
    `;
}

function showFirebaseError(error) {
    const tbody = document.getElementById('branchesTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="error-state">
                <div class="error-content firebase-error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Error al cargar sucursales</h3>
                    <p class="error-message">${escapeHTML(error.message || 'Error de conexión con Firebase')}</p>
                    <p>Verifica tu conexión a internet y recarga la página.</p>
                    <button onclick="window.location.reload()" class="reload-btn">
                        <i class="fas fa-sync-alt"></i> Recargar página
                    </button>
                </div>
            </td>
        </tr>
    `;

    const paginacionContainer = document.querySelector('.pagination-container');
    if (paginacionContainer) paginacionContainer.style.display = 'none';
}

function showError(message) {
    const tbody = document.getElementById('branchesTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="error-state">
                <div class="error-content">
                    <i class="fas fa-exclamation-circle"></i>
                    <h3>${escapeHTML(message)}</h3>
                    <button onclick="window.location.reload()" class="reload-btn">
                        <i class="fas fa-sync-alt"></i> Reintentar
                    </button>
                </div>
            </td>
        </tr>
    `;

    const paginacionContainer = document.querySelector('.pagination-container');
    if (paginacionContainer) paginacionContainer.style.display = 'none';
}

function escapeHTML(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}