// editUser.js - Editor de colaboradores (VERSIÓN DEPURACIÓN - CON SUCURSAL VISIBLE)
// CON REGISTRO DE BITÁCORA
import { UserManager } from '/clases/user.js';
import { AreaManager } from '/clases/area.js';

let historialManager = null;
let sucursalManager = null;

document.addEventListener('DOMContentLoaded', async function () {
    try {
        await inicializarManagers();
        const userManager = new UserManager();
        iniciarEditor(userManager);
    } catch (error) {
        console.error('❌ Error cargando módulos:', error);
        mostrarErrorConfiguracion(error);
    }
});

async function inicializarManagers() {
    try {
        const { HistorialUsuarioManager } = await import('/clases/historialUsuario.js');
        historialManager = new HistorialUsuarioManager();
        console.log('📋 HistorialManager inicializado para editar usuarios');
    } catch (error) {
        console.error('Error inicializando historialManager:', error);
    }

    try {
        const { SucursalManager } = await import('/clases/sucursal.js');
        sucursalManager = new SucursalManager();
        console.log('🏢 SucursalManager inicializado para editar usuarios');
    } catch (error) {
        console.error('Error inicializando sucursalManager:', error);
    }
}

// Registrar edición de colaborador
async function registrarEdicionColaborador(colaboradorOriginal, datosActualizados, cambios, usuarioActual) {
    if (!historialManager) return;

    try {
        await historialManager.registrarActividad({
            usuario: usuarioActual,
            tipo: 'editar',
            modulo: 'usuarios',
            descripcion: `Editó colaborador: ${colaboradorOriginal.nombreCompleto || colaboradorOriginal.nombre}`,
            detalles: {
                colaboradorId: colaboradorOriginal.id,
                colaboradorNombre: colaboradorOriginal.nombreCompleto || colaboradorOriginal.nombre,
                colaboradorEmail: colaboradorOriginal.correoElectronico,
                cambios: cambios,
                fechaEdicion: new Date().toISOString()
            }
        });
        console.log(`✅ Edición de colaborador "${colaboradorOriginal.nombreCompleto}" registrada en bitácora`);
    } catch (error) {
        console.error('Error registrando edición de colaborador:', error);
    }
}

// Registrar cambio de estado
async function registrarCambioEstadoColaborador(colaborador, nuevoEstado, estadoAnterior, usuarioActual) {
    if (!historialManager) return;

    try {
        const nuevoEstadoTexto = nuevoEstado ? 'activo' : 'inactivo';
        const estadoAnteriorTexto = estadoAnterior ? 'activo' : 'inactivo';

        await historialManager.registrarActividad({
            usuario: usuarioActual,
            tipo: 'editar',
            modulo: 'usuarios',
            descripcion: `${nuevoEstado ? 'Habilitó' : 'Inhabilitó'} colaborador: ${colaborador.nombreCompleto || colaborador.nombre}`,
            detalles: {
                colaboradorId: colaborador.id,
                colaboradorNombre: colaborador.nombreCompleto || colaborador.nombre,
                colaboradorEmail: colaborador.correoElectronico,
                estadoAnterior: estadoAnteriorTexto,
                estadoNuevo: nuevoEstadoTexto,
                fechaCambio: new Date().toISOString()
            }
        });
        console.log(`✅ Cambio de estado de colaborador "${colaborador.nombreCompleto}" registrado en bitácora`);
    } catch (error) {
        console.error('Error registrando cambio de estado de colaborador:', error);
    }
}

// Registrar inhabilitación
async function registrarInhabilitacionColaborador(colaborador, usuarioActual) {
    if (!historialManager) return;

    try {
        await historialManager.registrarActividad({
            usuario: usuarioActual,
            tipo: 'eliminar',
            modulo: 'usuarios',
            descripcion: `Inhabilitó colaborador: ${colaborador.nombreCompleto || colaborador.nombre}`,
            detalles: {
                colaboradorId: colaborador.id,
                colaboradorNombre: colaborador.nombreCompleto || colaborador.nombre,
                colaboradorEmail: colaborador.correoElectronico,
                fechaInhabilitacion: new Date().toISOString(),
                razon: 'Inhabilitado desde el panel de edición'
            }
        });
        console.log(`✅ Inhabilitación de colaborador "${colaborador.nombreCompleto}" registrada en bitácora`);
    } catch (error) {
        console.error('Error registrando inhabilitación de colaborador:', error);
    }
}

// Registrar cambio de foto
async function registrarCambioFotoPerfil(colaborador, usuarioActual) {
    if (!historialManager) return;

    try {
        await historialManager.registrarActividad({
            usuario: usuarioActual,
            tipo: 'editar',
            modulo: 'usuarios',
            descripcion: `Cambió foto de perfil de colaborador: ${colaborador.nombreCompleto || colaborador.nombre}`,
            detalles: {
                colaboradorId: colaborador.id,
                colaboradorNombre: colaborador.nombreCompleto || colaborador.nombre,
                colaboradorEmail: colaborador.correoElectronico,
                fechaCambio: new Date().toISOString()
            }
        });
        console.log(`✅ Cambio de foto de perfil de colaborador "${colaborador.nombreCompleto}" registrado en bitácora`);
    } catch (error) {
        console.error('Error registrando cambio de foto de perfil:', error);
    }
}

// Registrar cambio de sucursal
async function registrarCambioSucursal(colaborador, sucursalAnterior, sucursalNueva, usuarioActual) {
    if (!historialManager) return;

    try {
        await historialManager.registrarActividad({
            usuario: usuarioActual,
            tipo: 'editar',
            modulo: 'usuarios',
            descripcion: `Cambió sucursal de colaborador: ${colaborador.nombreCompleto || colaborador.nombre}`,
            detalles: {
                colaboradorId: colaborador.id,
                colaboradorNombre: colaborador.nombreCompleto || colaborador.nombre,
                colaboradorEmail: colaborador.correoElectronico,
                sucursalAnterior: sucursalAnterior || 'No asignada',
                sucursalNueva: sucursalNueva || 'No asignada',
                fechaCambio: new Date().toISOString()
            }
        });
        console.log(`✅ Cambio de sucursal de colaborador "${colaborador.nombreCompleto}" registrado en bitácora`);
    } catch (error) {
        console.error('Error registrando cambio de sucursal:', error);
    }
}

// Verificar límite de sucursal (máximo 2 colaboradores)
async function verificarLimiteSucursal(sucursalId, organizacionCamelCase, colaboradorIdActual) {
    if (!sucursalId || !sucursalManager) return true;

    try {
        const { UserManager } = await import('/clases/user.js');
        const userManager = new UserManager();

        const colaboradores = await userManager.getColaboradoresByOrganizacion(organizacionCamelCase, true);

        const colaboradoresEnSucursal = colaboradores.filter(colab =>
            colab.sucursalAsignadaId === sucursalId && colab.id !== colaboradorIdActual
        );

        if (colaboradoresEnSucursal.length >= 2) {
            return false;
        }

        return true;

    } catch (error) {
        console.error('Error verificando límite de sucursal:', error);
        return true;
    }
}

// ==================== VARIABLES GLOBALES ====================
let selectedFile = null;
let currentPhotoType = '';
let currentPhotoElements = null;

// ==================== FUNCIONES PRINCIPALES ====================

async function iniciarEditor(userManager) {
    const collaboratorId = obtenerIdDesdeURL();
    if (!collaboratorId) return;

    const elements = obtenerElementosDOM();
    currentPhotoElements = elements;

    try {
        const usuarioActual = obtenerUsuarioActual();

        if (!usuarioActual) {
            console.warn('No hay información de usuario, usando valores por defecto');
            usuarioActual = {
                id: `usuario_${Date.now()}`,
                uid: `usuario_${Date.now()}`,
                nombreCompleto: 'Usuario',
                organizacion: 'Mi Organización',
                organizacionCamelCase: 'miOrganizacion',
                correoElectronico: 'usuario@ejemplo.com'
            };
        }

        window.usuarioActual = usuarioActual;

        await cargarDatosColaborador(userManager, collaboratorId, elements);
        configurarHandlersBasicos(elements);
        configurarFotoPerfil(elements, userManager);
        configurarGuardado(elements, userManager);
        configurarCambioPassword(elements, userManager);
        configurarEliminacion(elements, userManager);
        configurarSelectorStatus(elements);
        configurarFiltroNumerico(elements);

        // Cargar áreas (esto también cargará sucursales si el área es sucursales)
        await cargarAreas(elements);

    } catch (error) {
        console.error('❌ Error inicializando editor:', error);
        mostrarMensaje(elements.mainMessage, 'error',
            'Error al cargar datos del colaborador: ' + error.message);
    }
}

// Filtro solo números para teléfono
function configurarFiltroNumerico(elements) {
    if (elements.telefono) {
        elements.telefono.addEventListener('input', function (e) {
            this.value = this.value.replace(/[^0-9]/g, '');
            if (this.value.length > 15) {
                this.value = this.value.slice(0, 15);
            }
        });

        elements.telefono.addEventListener('paste', function (e) {
            e.preventDefault();
            const pastedText = (e.clipboardData || window.clipboardData).getData('text');
            const numericOnly = pastedText.replace(/[^0-9]/g, '');
            if (numericOnly) {
                this.value = numericOnly.slice(0, 15);
                const inputEvent = new Event('input', { bubbles: true });
                this.dispatchEvent(inputEvent);
            }
        });

        elements.telefono.addEventListener('keypress', function (e) {
            if (e.ctrlKey || e.altKey || e.metaKey) return;
            if (e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Tab' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') return;
            if (!/^[0-9]$/.test(e.key)) {
                e.preventDefault();
            }
        });
    }
}

// Obtener usuario actual
function obtenerUsuarioActual() {
    try {
        const adminInfo = JSON.parse(localStorage.getItem('adminInfo') || '{}');
        if (adminInfo && Object.keys(adminInfo).length > 0) {
            return {
                id: adminInfo.id || adminInfo.uid || `admin_${Date.now()}`,
                uid: adminInfo.uid || adminInfo.id,
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
                uid: userData.uid || userData.id,
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

// Funciones de utilidad
function obtenerIdDesdeURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const collaboratorId = urlParams.get('id');

    if (!collaboratorId) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se especificó el colaborador a editar',
            confirmButtonText: 'Volver'
        }).then(() => {
            window.location.href = '../usuarios/usuarios.html';
        });
        return null;
    }

    return collaboratorId;
}

function obtenerElementosDOM() {
    return {
        profileCircle: document.getElementById('profileCircle'),
        profileImage: document.getElementById('profileImage'),
        profilePlaceholder: document.getElementById('profilePlaceholder'),
        editProfileOverlay: document.getElementById('editProfileOverlay'),
        profileInput: document.getElementById('profile-input'),

        orgCircle: document.getElementById('orgCircle'),
        orgImage: document.getElementById('orgImage'),
        orgPlaceholder: document.getElementById('orgPlaceholder'),

        fullName: document.getElementById('fullName'),
        email: document.getElementById('email'),
        telefono: document.getElementById('telefono'),
        organizationName: document.getElementById('organizationName'),
        areaSelect: document.getElementById('areaSelect'),
        cargoEnAreaSelect: document.getElementById('cargoEnAreaSelect'),
        sucursalContainer: document.getElementById('sucursalContainer'),
        sucursalSelect: document.getElementById('sucursalSelect'),
        sucursalHint: document.getElementById('sucursalHint'),
        statusInput: document.getElementById('status'),

        creationDate: document.getElementById('creationDate'),
        creationTime: document.getElementById('creationTime'),
        lastUpdateDate: document.getElementById('lastUpdateDate'),
        lastUpdateTime: document.getElementById('lastUpdateTime'),
        lastLoginDate: document.getElementById('lastLoginDate'),
        lastLoginTime: document.getElementById('lastLoginTime'),

        saveChangesBtn: document.getElementById('saveChangesBtn'),
        cancelBtn: document.getElementById('cancelBtn'),
        deleteBtn: document.getElementById('deleteBtn'),
        changePasswordBtn: document.getElementById('changePasswordBtn'),
        mainMessage: document.getElementById('mainMessage'),

        statusOptions: document.querySelectorAll('.status-option')
    };
}

function mostrarErrorConfiguracion(error) {
    Swal.fire({
        icon: 'error',
        title: 'Error de configuración',
        html: `
            <div>
                <p><strong>No se pudo cargar los módulos necesarios</strong></p>
                <p>Error: ${error.message}</p>
                <p>Verifica que los archivos existan en las rutas correctas:</p>
                <ul>
                    <li><code>/clases/user.js</code></li>
                    <li><code>/clases/area.js</code></li>
                    <li><code>/clases/sucursal.js</code></li>
                </ul>
            </div>
        `,
        confirmButtonText: 'Entendido',
        allowOutsideClick: false
    }).then(() => {
        window.location.href = '../usuarios/usuarios.html';
    });
}

async function cargarDatosColaborador(userManager, collaboratorId, elements) {
    try {
        Swal.fire({
            title: 'Cargando datos...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        const collaborator = await userManager.getUserById(collaboratorId);

        if (!collaborator) {
            Swal.close();
            throw new Error('Colaborador no encontrado');
        }

        // 🔴 LOG IMPORTANTE - Verificar datos de sucursal
        console.log('🔴🔴🔴 DATOS DEL COLABORADOR DESDE USERMANAGER:');
        console.log('   - sucursalAsignadaId:', collaborator.sucursalAsignadaId);
        console.log('   - sucursalAsignadaNombre:', collaborator.sucursalAsignadaNombre);
        console.log('   - sucursalAsignadaCiudad:', collaborator.sucursalAsignadaCiudad);
        console.log('   - areaAsignadaId:', collaborator.areaAsignadaId);

        window.currentCollaborator = collaborator;
        window.colaboradorOriginal = JSON.parse(JSON.stringify(collaborator));

        actualizarInterfaz(elements, collaborator);
        deshabilitarLogoOrganizacion(elements);

        Swal.close();

        mostrarMensaje(elements.mainMessage, 'success',
            `Editando colaborador: ${collaborator.nombreCompleto}`);

    } catch (error) {
        Swal.close();
        console.error('❌ Error cargando datos:', error);

        Swal.fire({
            icon: 'error',
            title: 'Error al cargar',
            text: error.message,
            confirmButtonText: 'Volver'
        }).then(() => {
            window.location.href = '../usuarios/usuarios.html';
        });

        throw error;
    }
}

function deshabilitarLogoOrganizacion(elements) {
    if (elements.orgCircle) {
        elements.orgCircle.classList.add('org-disabled');
        elements.orgCircle.style.cursor = 'default';
    }
}

function actualizarInterfaz(elements, collaborator) {
    if (elements.fullName && collaborator.nombreCompleto) {
        elements.fullName.value = collaborator.nombreCompleto;
    }

    if (elements.email && collaborator.correoElectronico) {
        elements.email.value = collaborator.correoElectronico;
    }

    if (elements.telefono && collaborator.telefono) {
        elements.telefono.value = collaborator.telefono;
    }

    if (elements.organizationName && collaborator.organizacion) {
        elements.organizationName.value = collaborator.organizacion;
    }

    let statusValue = 'active';
    if (collaborator.eliminado) {
        statusValue = 'inactive';
    } else if (collaborator.status === 'pending') {
        statusValue = 'pending';
    } else if (!collaborator.status) {
        statusValue = 'inactive';
    }

    if (elements.statusInput) {
        elements.statusInput.value = statusValue;
    }

    if (elements.statusOptions) {
        elements.statusOptions.forEach(option => {
            option.classList.remove('selected');
            if (option.getAttribute('data-status') === statusValue) {
                option.classList.add('selected');
            }
        });
    }

    // Foto de perfil
    if (collaborator.fotoUsuario) {
        const profileUrl = collaborator.getFotoUrl();
        if (elements.profileImage) {
            elements.profileImage.src = profileUrl;
            elements.profileImage.style.display = 'block';

            elements.profileImage.onerror = function () {
                this.style.display = 'none';
                if (elements.profilePlaceholder) {
                    elements.profilePlaceholder.style.display = 'flex';
                }
            };
        }
        if (elements.profilePlaceholder) {
            elements.profilePlaceholder.style.display = 'none';
        }
    }

    // Logo de organización
    if (collaborator.fotoOrganizacion) {
        const orgUrl = collaborator.fotoOrganizacion;
        if (elements.orgImage) {
            elements.orgImage.src = orgUrl;
            elements.orgImage.style.display = 'block';

            elements.orgImage.onerror = function () {
                this.style.display = 'none';
                if (elements.orgPlaceholder) {
                    elements.orgPlaceholder.style.display = 'flex';
                }
            };
        }
        if (elements.orgPlaceholder) {
            elements.orgPlaceholder.style.display = 'none';
        }
    }

    const formatDate = (date) => {
        if (!date) return { date: 'N/A', time: '' };
        const d = date.toDate ? date.toDate() : new Date(date);
        return {
            date: d.toLocaleDateString('es-MX'),
            time: d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
        };
    };

    const creationDate = formatDate(collaborator.fechaCreacion);
    if (elements.creationDate) elements.creationDate.textContent = creationDate.date;
    if (elements.creationTime) elements.creationTime.textContent = creationDate.time;

    const updateDate = formatDate(collaborator.fechaActualizacion);
    if (elements.lastUpdateDate) elements.lastUpdateDate.textContent = updateDate.date;
    if (elements.lastUpdateTime) elements.lastUpdateTime.textContent = updateDate.time;

    const loginDate = formatDate(collaborator.ultimoLogin);
    if (elements.lastLoginDate) elements.lastLoginDate.textContent = loginDate.date;
    if (elements.lastLoginTime) elements.lastLoginTime.textContent = loginDate.time;
}

function mostrarMensaje(element, type, text) {
    if (!element) return;

    const icons = {
        'success': 'fa-check-circle',
        'error': 'fa-exclamation-circle',
        'info': 'fa-info-circle',
        'warning': 'fa-exclamation-triangle'
    };

    element.className = `message-container ${type}`;
    element.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <i class="fas ${icons[type] || 'fa-info-circle'}"></i>
            <span>${text}</span>
        </div>
    `;
    element.style.display = 'block';

    if (type !== 'error') {
        setTimeout(() => {
            element.style.display = 'none';
        }, 5000);
    }
}

// ========== FUNCIONES PARA CARGAR ÁREAS Y SUCURSALES ==========

async function cargarAreas(elements) {
    if (!elements.areaSelect) return;

    const collaborator = window.currentCollaborator;
    if (!collaborator) return;

    const usuarioActual = window.usuarioActual;
    if (!usuarioActual) return;

    try {
        const areaManager = new AreaManager();
        const organizacionCamelCase = usuarioActual.organizacionCamelCase;

        elements.areaSelect.innerHTML = '<option value="">Cargando áreas...</option>';
        elements.areaSelect.disabled = true;
        elements.cargoEnAreaSelect.innerHTML = '<option value="">Primero selecciona un área</option>';
        elements.cargoEnAreaSelect.disabled = true;

        const areas = await areaManager.getAreasByOrganizacion(organizacionCamelCase);

        elements.areaSelect._areasData = areas;

        if (areas.length === 0) {
            elements.areaSelect.innerHTML = '<option value="">No hay áreas disponibles</option>';
            elements.areaSelect.disabled = false;
            return;
        }

        let options = '<option value="">Selecciona un área</option>';
        areas.forEach(area => {
            options += `<option value="${area.id}" data-nombre="${area.nombreArea}">${area.nombreArea}</option>`;
        });
        elements.areaSelect.innerHTML = options;
        elements.areaSelect.disabled = false;

        if (collaborator.areaAsignadaId) {
            const areaExiste = areas.some(a => a.id === collaborator.areaAsignadaId);

            if (areaExiste) {
                elements.areaSelect.value = collaborator.areaAsignadaId;

                // Disparar evento change para cargar cargos
                const event = new Event('change', { bubbles: true });
                elements.areaSelect.dispatchEvent(event);

                // ✅ VERIFICAR SI ES ÁREA SUCURSALES Y FORZAR CARGA DE SUCURSAL
                const areaNombre = elements.areaSelect.options[elements.areaSelect.selectedIndex]?.getAttribute('data-nombre') || '';
                const esAreaSucursales = areaNombre.toLowerCase() === 'sucursales' || areaNombre.toLowerCase() === 'sucursal';

                console.log('🔴 Área seleccionada:', areaNombre, 'esAreaSucursales:', esAreaSucursales);
                console.log('🔴 Sucursal asignada del colaborador:', collaborator.sucursalAsignadaId, collaborator.sucursalAsignadaNombre);

                if (esAreaSucursales && collaborator.sucursalAsignadaId) {
                    console.log('🏢 Área sucursales detectada, forzando carga de sucursal asignada:', collaborator.sucursalAsignadaId);
                    setTimeout(() => {
                        cargarSucursales(elements);
                    }, 300);
                }

                // Seleccionar cargo
                const seleccionarCargo = () => {
                    if (collaborator.cargo && collaborator.cargo.id) {
                        const cargoSelect = elements.cargoEnAreaSelect;
                        if (cargoSelect) {
                            const option = Array.from(cargoSelect.options).find(opt => opt.value === collaborator.cargo.id);
                            if (option) {
                                cargoSelect.value = option.value;
                                console.log('✅ Cargo seleccionado por ID:', collaborator.cargo.id);
                                return true;
                            }
                        }
                    }

                    if (collaborator.cargo && collaborator.cargo.nombre) {
                        const optionPorNombre = Array.from(elements.cargoEnAreaSelect.options).find(
                            opt => opt.text === collaborator.cargo.nombre
                        );
                        if (optionPorNombre) {
                            elements.cargoEnAreaSelect.value = optionPorNombre.value;
                            console.log('✅ Cargo seleccionado por nombre:', collaborator.cargo.nombre);
                            return true;
                        }
                    }
                    return false;
                };

                setTimeout(seleccionarCargo, 300);
                setTimeout(seleccionarCargo, 600);
                setTimeout(seleccionarCargo, 1000);
            }
        }

    } catch (error) {
        console.error('❌ Error cargando áreas:', error);
        elements.areaSelect.innerHTML = '<option value="">Error al cargar áreas</option>';
        elements.areaSelect.disabled = false;

        Swal.fire({
            icon: 'warning',
            title: 'Error al cargar áreas',
            text: 'No se pudieron cargar las áreas. Puedes continuar editando pero no podrás cambiar el área.',
            confirmButtonText: 'ENTENDIDO'
        });
    }
}

function cargarCargosPorArea(elements) {
    if (!elements.areaSelect || !elements.cargoEnAreaSelect) return;

    const areaId = elements.areaSelect.value;
    const areaNombre = elements.areaSelect.options[elements.areaSelect.selectedIndex]?.getAttribute('data-nombre') || '';
    const areas = elements.areaSelect._areasData || [];

    elements.cargoEnAreaSelect.innerHTML = '';
    elements.cargoEnAreaSelect.disabled = true;

    // Ocultar campo de sucursal por defecto
    if (elements.sucursalContainer) {
        elements.sucursalContainer.style.display = 'none';
    }

    if (!areaId) {
        elements.cargoEnAreaSelect.innerHTML = '<option value="">Primero selecciona un área</option>';
        return;
    }

    const areaSeleccionada = areas.find(a => a.id === areaId);

    if (!areaSeleccionada) {
        elements.cargoEnAreaSelect.innerHTML = '<option value="">Área no encontrada</option>';
        return;
    }

    const cargos = areaSeleccionada.getCargosAsArray ? areaSeleccionada.getCargosAsArray() : [];

    if (cargos.length === 0) {
        elements.cargoEnAreaSelect.innerHTML = '<option value="">Esta área no tiene cargos</option>';
    } else {
        let options = '<option value="">Selecciona un cargo</option>';
        cargos.forEach((cargo, index) => {
            const cargoId = cargo.id || `cargo_${index}`;
            options += `<option value="${cargoId}">${cargo.nombre || 'Cargo sin nombre'}</option>`;

            if (!elements.cargoEnAreaSelect._cargosData) {
                elements.cargoEnAreaSelect._cargosData = {};
            }
            elements.cargoEnAreaSelect._cargosData[cargoId] = cargo;
        });
        elements.cargoEnAreaSelect.innerHTML = options;
    }

    elements.cargoEnAreaSelect.disabled = false;

    // Verificar si el área seleccionada es "sucursales" para mostrar el campo de sucursal
    const esAreaSucursales = areaNombre.toLowerCase() === 'sucursales' || areaNombre.toLowerCase() === 'sucursal';

    if (esAreaSucursales) {
        console.log('🏢 Área "sucursales" seleccionada, cargando sucursales...');
        cargarSucursales(elements);
    }
}

async function cargarSucursales(elements) {
    if (!elements.sucursalSelect || !sucursalManager) return;

    try {
        const usuarioActual = window.usuarioActual;
        const collaborator = window.currentCollaborator;

        if (!usuarioActual || !usuarioActual.organizacionCamelCase) {
            console.warn('No se pudo cargar sucursales: organización no disponible');
            return;
        }

        // Guardar el ID de la sucursal asignada ANTES de cargar
        const sucursalAsignadaId = collaborator.sucursalAsignadaId;
        const sucursalAsignadaNombre = collaborator.sucursalAsignadaNombre;

        console.log('🔴🔴🔴 CARGANDO SUCURSALES - DATOS DEL COLABORADOR:');
        console.log('   - sucursalAsignadaId:', sucursalAsignadaId);
        console.log('   - sucursalAsignadaNombre:', sucursalAsignadaNombre);

        elements.sucursalSelect.innerHTML = '<option value="">Cargando sucursales...</option>';
        elements.sucursalSelect.disabled = true;

        const sucursales = await sucursalManager.getSucursalesByOrganizacion(usuarioActual.organizacionCamelCase);

        console.log('🔴 SUCURSALES DISPONIBLES EN LA BASE DE DATOS:');
        sucursales.forEach(s => {
            console.log(`   - ID: ${s.id}, Nombre: ${s.nombre}`);
        });

        if (sucursales.length === 0) {
            elements.sucursalSelect.innerHTML = '<option value="">No hay sucursales disponibles</option>';
            if (elements.sucursalHint) {
                elements.sucursalHint.innerHTML = '<i class="fas fa-exclamation-triangle"></i> No hay sucursales registradas. Crea una sucursal primero.';
            }
            elements.sucursalSelect.disabled = true;
        } else {
            // Construir opciones
            let options = '<option value="">Selecciona una sucursal (opcional)</option>';
            let sucursalEncontrada = false;
            let valorSeleccionado = '';

            sucursales.forEach(sucursal => {
                // Comparar por ID para seleccionar
                const isSelected = (sucursalAsignadaId === sucursal.id);
                if (isSelected) {
                    sucursalEncontrada = true;
                    valorSeleccionado = sucursal.id;
                    console.log(`✅✅✅ SUCURSAL ENCONTRADA PARA SELECCIONAR: ${sucursal.nombre} (${sucursal.id})`);
                }
                const selectedAttr = isSelected ? 'selected' : '';
                options += `<option value="${sucursal.id}" data-nombre="${sucursal.nombre}" data-ciudad="${sucursal.ciudad}" ${selectedAttr}>${sucursal.nombre} - ${sucursal.ciudad || 'Sin ciudad'}</option>`;
            });

            elements.sucursalSelect.innerHTML = options;
            elements.sucursalSelect.disabled = false;

            // Forzar la selección programáticamente si es necesario
            if (sucursalAsignadaId && sucursalEncontrada) {
                elements.sucursalSelect.value = valorSeleccionado;
                console.log('✅ Sucursal forzada en el select, valor actual:', elements.sucursalSelect.value);
                console.log('✅ Texto seleccionado:', elements.sucursalSelect.options[elements.sucursalSelect.selectedIndex]?.text);
            }

            // Verificar que la selección se aplicó correctamente
            if (sucursalAsignadaId) {
                if (sucursalEncontrada) {
                    console.log('✅ Sucursal seleccionada en el select:', elements.sucursalSelect.value);
                    if (elements.sucursalHint) {
                        elements.sucursalHint.innerHTML = '<i class="fas fa-check-circle" style="color: #28a745;"></i> Sucursal asignada: ' + sucursalAsignadaNombre;
                    }
                } else {
                    console.warn('⚠️ Sucursal asignada NO ENCONTRADA en la lista:', sucursalAsignadaId);
                    if (elements.sucursalHint) {
                        elements.sucursalHint.innerHTML = '<i class="fas fa-exclamation-triangle" style="color: #ff9800;"></i> La sucursal asignada "' + sucursalAsignadaNombre + '" ya no existe. Selecciona una nueva.';
                    }
                }
            } else {
                if (elements.sucursalHint) {
                    elements.sucursalHint.innerHTML = '<i class="fas fa-info-circle"></i> Opcional. Selecciona la sucursal a la que pertenecerá (máximo 2 colaboradores por sucursal)';
                }
            }
        }

        // Mostrar el contenedor de sucursal
        if (elements.sucursalContainer) {
            elements.sucursalContainer.style.display = 'block';
        }

        // Guardar lista de sucursales para validaciones posteriores
        elements.sucursalSelect._sucursalesData = sucursales;

    } catch (error) {
        console.error('❌ Error cargando sucursales:', error);
        elements.sucursalSelect.innerHTML = '<option value="">Error al cargar sucursales</option>';
        if (elements.sucursalHint) {
            elements.sucursalHint.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error al cargar sucursales';
        }
        elements.sucursalSelect.disabled = true;
    }
}

function configurarSelectoresAreaCargo(elements) {
    if (!elements.areaSelect || !elements.cargoEnAreaSelect) return;

    elements.areaSelect.addEventListener('change', () => {
        cargarCargosPorArea(elements);
    });
}

// Handlers básicos
function configurarHandlersBasicos(elements) {
    if (elements.cancelBtn) {
        elements.cancelBtn.addEventListener('click', () => {
            Swal.fire({
                title: '¿Cancelar cambios?',
                text: 'Se perderán los cambios no guardados',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'CONFIRMAR',
                cancelButtonText: 'CANCELAR'
            }).then((result) => {
                if (result.isConfirmed) {
                    window.location.href = '../usuarios/usuarios.html';
                }
            });
        });
    }

    configurarSelectoresAreaCargo(elements);
}

function configurarSelectorStatus(elements) {
    if (!elements.statusOptions || !elements.statusInput) return;

    elements.statusOptions.forEach(option => {
        option.addEventListener('click', function () {
            elements.statusOptions.forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
            const statusValue = this.getAttribute('data-status');
            elements.statusInput.value = statusValue;
        });
    });
}

// Configurar foto de perfil
function configurarFotoPerfil(elements, userManager) {
    if (!elements.profileCircle) return;

    elements.profileCircle.addEventListener('click', () => {
        if (elements.profileInput) elements.profileInput.click();
    });

    if (elements.editProfileOverlay) {
        elements.editProfileOverlay.addEventListener('click', (e) => {
            e.stopPropagation();
            if (elements.profileInput) elements.profileInput.click();
        });
    }

    if (elements.profileInput) {
        elements.profileInput.addEventListener('change', function (e) {
            const file = e.target.files[0];
            if (file) mostrarModalFotoConSwal(file, elements, userManager);
            this.value = '';
        });
    }
}

function mostrarModalFotoConSwal(file, elements, userManager) {
    const maxSize = 5;
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif'];

    if (!validTypes.includes(file.type)) {
        mostrarMensaje(elements.mainMessage, 'error', 'Formato no válido. Use JPG, PNG o GIF');
        return;
    }

    if (file.size > maxSize * 1024 * 1024) {
        mostrarMensaje(elements.mainMessage, 'error', `Archivo demasiado grande. Máximo: ${maxSize}MB`);
        return;
    }

    const reader = new FileReader();

    reader.onload = function (e) {
        const imageBase64 = e.target.result;

        Swal.fire({
            title: 'Cambiar foto de perfil',
            html: `
                <div style="text-align: center;">
                    <img src="${imageBase64}" style="width: 150px; height: 150px; border-radius: 50%; object-fit: cover; border: 3px solid var(--color-accent-primary); margin-bottom: 15px;">
                    <p>Tamaño: ${(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                    <p>¿Deseas usar esta imagen?</p>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'CONFIRMAR',
            cancelButtonText: 'CANCELAR',
            reverseButtons: false
        }).then(async (result) => {
            if (result.isConfirmed) {
                await guardarFotoPerfil(imageBase64, elements, userManager);
            }
        });
    };

    reader.readAsDataURL(file);
}

async function guardarFotoPerfil(imageBase64, elements, userManager) {
    if (!window.currentCollaborator) return;

    Swal.fire({
        title: 'Guardando foto...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const collaborator = window.currentCollaborator;
        const usuarioActual = window.usuarioActual;

        const success = await userManager.updateUser(
            collaborator.id,
            { fotoUsuario: imageBase64 },
            'colaborador',
            collaborator.organizacionCamelCase || usuarioActual.organizacionCamelCase
        );

        if (success) {
            if (elements.profileImage) {
                elements.profileImage.src = imageBase64;
                elements.profileImage.style.display = 'block';
            }
            if (elements.profilePlaceholder) {
                elements.profilePlaceholder.style.display = 'none';
            }

            collaborator.fotoUsuario = imageBase64;

            await registrarCambioFotoPerfil(collaborator, usuarioActual);

            Swal.close();
            Swal.fire({
                icon: 'success',
                title: '¡Éxito!',
                text: 'Foto actualizada correctamente',
                timer: 3000,
                showConfirmButton: false
            });
        }
    } catch (error) {
        Swal.close();
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo guardar la imagen: ' + error.message
        });
    }
}

// Guardar cambios
function configurarGuardado(elements, userManager) {
    if (!elements.saveChangesBtn || !window.currentCollaborator) return;

    elements.saveChangesBtn.addEventListener('click', async () => {
        if (!elements.fullName || !elements.fullName.value.trim()) {
            mostrarMensaje(elements.mainMessage, 'error', 'El nombre completo es obligatorio');
            if (elements.fullName) elements.fullName.focus();
            return;
        }

        const collaborator = window.currentCollaborator;
        const colaboradorOriginal = window.colaboradorOriginal;
        const usuarioActual = window.usuarioActual;

        let areaNombre = 'No asignada';
        let cargoNombre = 'No asignado';
        let cargoDescripcion = '';
        let cargoObjeto = null;

        const areas = elements.areaSelect._areasData || [];
        const areaSeleccionada = areas.find(a => a.id === elements.areaSelect?.value);
        if (areaSeleccionada) {
            areaNombre = areaSeleccionada.nombreArea;
        }

        const cargosData = elements.cargoEnAreaSelect._cargosData || {};
        const cargoSeleccionado = cargosData[elements.cargoEnAreaSelect?.value];
        if (cargoSeleccionado) {
            cargoNombre = cargoSeleccionado.nombre || 'Cargo sin nombre';
            cargoDescripcion = cargoSeleccionado.descripcion || '';
            cargoObjeto = {
                id: cargoSeleccionado.id || elements.cargoEnAreaSelect.value,
                nombre: cargoNombre,
                descripcion: cargoDescripcion
            };
        }

        let sucursalId = null;
        let sucursalNombre = null;
        let sucursalCiudad = null;
        let esAreaSucursales = false;

        const areaSeleccionadaElement = elements.areaSelect.options[elements.areaSelect.selectedIndex];
        const areaSeleccionadaNombre = areaSeleccionadaElement?.getAttribute('data-nombre') || '';
        esAreaSucursales = areaSeleccionadaNombre.toLowerCase() === 'sucursales' || areaSeleccionadaNombre.toLowerCase() === 'sucursal';

        if (esAreaSucursales && elements.sucursalSelect && elements.sucursalSelect.value) {
            sucursalId = elements.sucursalSelect.value;

            const sucursalesData = elements.sucursalSelect._sucursalesData || [];
            const sucursalSeleccionada = sucursalesData.find(s => s.id === sucursalId);
            if (sucursalSeleccionada) {
                sucursalNombre = sucursalSeleccionada.nombre;
                sucursalCiudad = sucursalSeleccionada.ciudad;
            }

            if (sucursalId && usuarioActual.organizacionCamelCase) {
                const limiteOk = await verificarLimiteSucursal(sucursalId, usuarioActual.organizacionCamelCase, collaborator.id);
                if (!limiteOk) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Límite de colaboradores alcanzado',
                        html: `La sucursal seleccionada ya tiene 2 colaboradores asignados.<br>
                               No se pueden asignar más colaboradores a esta sucursal.`,
                        confirmButtonText: 'ENTENDIDO'
                    });
                    return;
                }
            }
        }

        const cambios = [];
        const nuevosDatos = {
            nombreCompleto: elements.fullName.value.trim(),
            telefono: elements.telefono?.value.trim() || '',
            status: elements.statusInput.value === 'active',
            areaAsignadaId: elements.areaSelect?.value || null,
            cargo: cargoObjeto,
            sucursalAsignadaId: sucursalId,
            sucursalAsignadaNombre: sucursalNombre,
            sucursalAsignadaCiudad: sucursalCiudad
        };

        if (colaboradorOriginal.nombreCompleto !== nuevosDatos.nombreCompleto) {
            cambios.push({
                campo: 'nombre',
                anterior: colaboradorOriginal.nombreCompleto,
                nuevo: nuevosDatos.nombreCompleto
            });
        }

        const telefonoOriginal = colaboradorOriginal.telefono || '';
        if (telefonoOriginal !== nuevosDatos.telefono) {
            cambios.push({
                campo: 'teléfono',
                anterior: telefonoOriginal || 'No registrado',
                nuevo: nuevosDatos.telefono || 'No registrado'
            });
        }

        const estadoOriginal = colaboradorOriginal.status === true || colaboradorOriginal.status === 'active';
        if (estadoOriginal !== nuevosDatos.status) {
            cambios.push({
                campo: 'estado',
                anterior: estadoOriginal ? 'activo' : 'inactivo',
                nuevo: nuevosDatos.status ? 'activo' : 'inactivo'
            });
        }

        if (colaboradorOriginal.areaAsignadaId !== nuevosDatos.areaAsignadaId) {
            cambios.push({
                campo: 'área',
                anterior: colaboradorOriginal.areaAsignadaNombre || 'No asignada',
                nuevo: areaNombre
            });
        }

        const cargoOriginalNombre = colaboradorOriginal.cargo?.nombre || 'No asignado';
        if (cargoOriginalNombre !== cargoNombre) {
            cambios.push({
                campo: 'cargo',
                anterior: cargoOriginalNombre,
                nuevo: cargoNombre
            });
        }

        const sucursalOriginalNombre = colaboradorOriginal.sucursalAsignadaNombre || 'No asignada';
        if (sucursalOriginalNombre !== (sucursalNombre || 'No asignada')) {
            cambios.push({
                campo: 'sucursal',
                anterior: sucursalOriginalNombre,
                nuevo: sucursalNombre || 'No asignada'
            });
        }

        if (cambios.length === 0) {
            Swal.fire({
                icon: 'info',
                title: 'Sin cambios',
                text: 'No se detectaron cambios en los datos del colaborador',
                timer: 2000,
                showConfirmButton: false
            });
            return;
        }

        let confirmHtml = `
            <div>
                <p><strong>Nombre:</strong> ${elements.fullName.value}</p>
                <p><strong>Teléfono:</strong> ${elements.telefono?.value.trim() || 'No especificado'}</p>
                <p><strong>Área asignada:</strong> ${areaNombre}</p>
                <p><strong>Cargo en el área:</strong> ${cargoNombre}</p>
        `;

        if (esAreaSucursales) {
            confirmHtml += `<p><strong>Sucursal asignada:</strong> ${sucursalNombre ? `${sucursalNombre}${sucursalCiudad ? ` (${sucursalCiudad})` : ''}` : 'No asignada'}</p>`;
        }

        confirmHtml += `
                <p><strong>Status:</strong> ${elements.statusInput.value === 'active' ? 'Activo' : 'Inactivo'}</p>
                <div style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 8px; text-align: left;">
                    <strong>Cambios detectados:</strong>
                    ${cambios.map(c => `<p style="margin: 5px 0; font-size: 0.9rem;">• ${c.campo}: ${c.anterior} → ${c.nuevo}</p>`).join('')}
                </div>
            </div>
        `;

        const result = await Swal.fire({
            title: '¿Guardar cambios?',
            html: confirmHtml,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'GUARDAR',
            cancelButtonText: 'CANCELAR'
        });

        if (!result.isConfirmed) return;

        Swal.fire({
            title: 'Guardando cambios...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            const updateData = {
                nombreCompleto: elements.fullName.value.trim(),
                telefono: elements.telefono?.value.trim() || '',
                status: elements.statusInput.value === 'active',
                cargo: cargoObjeto,
                areaAsignadaId: elements.areaSelect?.value || null
            };

            if (esAreaSucursales) {
                updateData.sucursalAsignadaId = sucursalId;
                updateData.sucursalAsignadaNombre = sucursalNombre;
                updateData.sucursalAsignadaCiudad = sucursalCiudad;
                console.log('💾 Guardando sucursal:', { sucursalId, sucursalNombre, sucursalCiudad });
            } else {
                updateData.sucursalAsignadaId = null;
                updateData.sucursalAsignadaNombre = null;
                updateData.sucursalAsignadaCiudad = null;
                console.log('🗑️ Limpiando sucursal (área no es sucursales)');
            }

            await userManager.updateUser(
                collaborator.id,
                updateData,
                'colaborador',
                collaborator.organizacionCamelCase || usuarioActual.organizacionCamelCase
            );

            await registrarEdicionColaborador(colaboradorOriginal, nuevosDatos, cambios, usuarioActual);

            const sucursalCambio = cambios.find(c => c.campo === 'sucursal');
            if (sucursalCambio) {
                await registrarCambioSucursal(colaboradorOriginal, sucursalCambio.anterior, sucursalCambio.nuevo, usuarioActual);
            }

            Object.assign(collaborator, updateData);
            if (cargoObjeto) {
                collaborator.cargo = cargoObjeto;
            }
            collaborator.areaAsignadaNombre = areaNombre;

            const now = new Date();
            if (elements.lastUpdateDate) {
                elements.lastUpdateDate.textContent = now.toLocaleDateString('es-MX');
            }
            if (elements.lastUpdateTime) {
                elements.lastUpdateTime.textContent = now.toLocaleTimeString('es-MX', {
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }

            window.colaboradorOriginal = JSON.parse(JSON.stringify(collaborator));

            Swal.close();
            Swal.fire({
                icon: 'success',
                title: '¡Éxito!',
                text: 'Datos actualizados correctamente',
                timer: 3000,
                showConfirmButton: false
            });

            mostrarMensaje(elements.mainMessage, 'success', 'Cambios guardados exitosamente');

        } catch (error) {
            console.error('❌ Error guardando cambios:', error);
            Swal.close();

            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'No se pudieron guardar los cambios: ' + error.message
            });
        }
    });
}

// Cambiar contraseña
function configurarCambioPassword(elements, userManager) {
    if (!elements.changePasswordBtn) return;

    elements.changePasswordBtn.addEventListener('click', async () => {
        if (!window.currentCollaborator) {
            mostrarMensaje(elements.mainMessage, 'error', 'No hay colaborador cargado');
            return;
        }

        const collaborator = window.currentCollaborator;
        const userEmail = collaborator.correoElectronico;

        if (!userEmail) {
            mostrarMensaje(elements.mainMessage, 'error', 'No se encontró el correo del colaborador');
            return;
        }

        const result = await Swal.fire({
            title: '¿Enviar enlace para cambiar contraseña?',
            html: `
                <div>
                    <p><strong>Correo del colaborador:</strong> ${userEmail}</p>
                    <p><i class="fas fa-info-circle"></i> El enlace expirará en 1 hora.</p>
                </div>
            `,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'ENVIAR ENLACE',
            cancelButtonText: 'CANCELAR',
            allowOutsideClick: false
        });

        if (!result.isConfirmed) return;

        Swal.fire({
            title: 'Enviando enlace...',
            text: 'Por favor espera mientras procesamos tu solicitud.',
            allowOutsideClick: false,
            allowEscapeKey: false,
            showConfirmButton: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            const firebaseModule = await import('/config/firebase-config.js');
            const { sendPasswordResetEmail } = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js");

            const actionCodeSettings = {
                url: window.location.origin + '/verifyEmail.html',
                handleCodeInApp: false
            };

            await sendPasswordResetEmail(firebaseModule.auth, userEmail, actionCodeSettings);

            Swal.close();

            await Swal.fire({
                icon: 'success',
                title: '¡Enlace enviado exitosamente!',
                html: `
                    <div>
                        <p><strong>Destinatario:</strong> ${userEmail}</p>
                        <p><strong>Válido por:</strong> 1 hora</p>
                        <p>El colaborador recibirá instrucciones para restablecer su contraseña.</p>
                    </div>
                `,
                confirmButtonText: 'ENTENDIDO',
                allowOutsideClick: false,
                showCloseButton: true
            });

        } catch (error) {
            Swal.close();

            console.error('❌ Error enviando correo:', error);

            let errorMessage = 'Ocurrió un error al enviar el correo';

            switch (error.code) {
                case 'auth/user-not-found':
                    errorMessage = 'Usuario no encontrado';
                    break;
                case 'auth/invalid-email':
                    errorMessage = 'Correo inválido';
                    break;
                case 'auth/too-many-requests':
                    errorMessage = 'Demasiados intentos';
                    break;
                case 'auth/network-request-failed':
                    errorMessage = 'Error de conexión';
                    break;
                default:
                    errorMessage = 'Error del sistema';
            }

            Swal.fire({
                icon: 'error',
                title: errorMessage,
                text: 'Por favor, intenta nuevamente más tarde.',
                confirmButtonText: 'ENTENDIDO'
            });
        }
    });
}

// Eliminar/inhabilitar
function configurarEliminacion(elements, userManager) {
    if (!elements.deleteBtn) return;

    elements.deleteBtn.addEventListener('click', async () => {
        if (!window.currentCollaborator) {
            mostrarMensaje(elements.mainMessage, 'error', 'No hay colaborador cargado');
            return;
        }

        const collaborator = window.currentCollaborator;
        const fullName = elements.fullName.value || collaborator.nombreCompleto;
        const usuarioActual = window.usuarioActual;

        const result = await Swal.fire({
            title: '¿Inhabilitar colaborador?',
            html: `
                <div>
                    <p><strong>${fullName}</strong></p>
                    <p>${collaborator.correoElectronico}</p>
                    <p>¿Estás seguro de inhabilitar este colaborador?</p>
                    <p><i class="fas fa-exclamation-triangle"></i> Consecuencias:</p>
                    <ul>
                        <li>No podrá iniciar sesión</li>
                        <li>La información se conserva</li>
                        <li>Puede reactivarse después</li>
                    </ul>
                </div>
            `,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'INHABILITAR',
            cancelButtonText: 'CANCELAR',
            showDenyButton: true,
            denyButtonText: 'SOLO DESACTIVAR'
        });

        if (result.isDenied) {
            elements.statusInput.value = 'inactive';
            elements.statusOptions.forEach(opt => {
                opt.classList.remove('selected');
                if (opt.getAttribute('data-status') === 'inactive') {
                    opt.classList.add('selected');
                }
            });

            Swal.fire({
                icon: 'info',
                title: 'Status cambiado',
                text: 'El colaborador ha sido marcado como inactivo. Recuerda guardar los cambios.',
                timer: 3000,
                showConfirmButton: false
            });

            return;
        }

        if (!result.isConfirmed) return;

        Swal.fire({
            title: 'Inhabilitando colaborador...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            await userManager.inactivarUsuario(
                collaborator.id,
                'colaborador',
                collaborator.organizacionCamelCase || usuarioActual.organizacionCamelCase
            );

            await registrarInhabilitacionColaborador(collaborator, usuarioActual);

            elements.statusInput.value = 'inactive';
            elements.statusOptions.forEach(opt => {
                opt.classList.remove('selected');
                if (opt.getAttribute('data-status') === 'inactive') {
                    opt.classList.add('selected');
                }
            });

            collaborator.status = false;

            Swal.close();

            Swal.fire({
                icon: 'success',
                title: 'Colaborador inhabilitado',
                text: `${fullName} ha sido inhabilitado del sistema`,
                confirmButtonText: 'ENTENDIDO',
                timer: 3000
            });

            setTimeout(() => {
                window.location.href = '../usuarios/usuarios.html';
            }, 3000);

        } catch (error) {
            Swal.close();
            console.error('❌ Error inhabilitando colaborador:', error);

            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'No se pudo inhabilitar el colaborador: ' + error.message,
                confirmButtonText: 'ENTENDIDO'
            });
        }
    });
}