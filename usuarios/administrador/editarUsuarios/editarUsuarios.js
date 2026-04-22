// editUser.js - Editor de colaboradores (VERSIÓN CORREGIDA - SIN CAMPOS DE SUCURSAL)
// El código de colaborador almacena el ID de la sucursal si el área es "sucursales"
import { UserManager } from '/clases/user.js';
import { AreaManager } from '/clases/area.js';

let historialManager = null;
let sucursalManager = null;

// ==================== VARIABLES GLOBALES ====================
let pendingPhotoBase64 = null;

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
    } catch (error) {
        console.error('Error inicializando historialManager:', error);
    }

    try {
        const { SucursalManager } = await import('/clases/sucursal.js');
        sucursalManager = new SucursalManager();        
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
    } catch (error) {
        console.error('Error registrando edición de colaborador:', error);
    }
}

// Registrar cambio de código
async function registrarCambioCodigo(colaborador, codigoAnterior, codigoNuevo, usuarioActual) {
    if (!historialManager) return;

    try {
        await historialManager.registrarActividad({
            usuario: usuarioActual,
            tipo: 'editar',
            modulo: 'usuarios',
            descripcion: `Cambió código de colaborador: ${colaborador.nombreCompleto || colaborador.nombre}`,
            detalles: {
                colaboradorId: colaborador.id,
                colaboradorNombre: colaborador.nombreCompleto || colaborador.nombre,
                colaboradorEmail: colaborador.correoElectronico,
                codigoAnterior: codigoAnterior || 'Sin código',
                codigoNuevo: codigoNuevo || 'Sin código',
                fechaCambio: new Date().toISOString()
            }
        });    
    } catch (error) {
        console.error('Error registrando cambio de código:', error);
    }
}

// Registrar cambio de teléfono
async function registrarCambioTelefono(colaborador, telefonoAnterior, telefonoNuevo, usuarioActual) {
    if (!historialManager) return;

    try {
        await historialManager.registrarActividad({
            usuario: usuarioActual,
            tipo: 'editar',
            modulo: 'usuarios',
            descripcion: `Cambió teléfono de colaborador: ${colaborador.nombreCompleto || colaborador.nombre}`,
            detalles: {
                colaboradorId: colaborador.id,
                colaboradorNombre: colaborador.nombreCompleto || colaborador.nombre,
                colaboradorEmail: colaborador.correoElectronico,
                telefonoAnterior: telefonoAnterior || 'No registrado',
                telefonoNuevo: telefonoNuevo || 'No registrado',
                fechaCambio: new Date().toISOString()
            }
        });        
    } catch (error) {
        console.error('Error registrando cambio de teléfono:', error);
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
    } catch (error) {
        console.error('Error registrando cambio de foto de perfil:', error);
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
                fechaInhabilitacion: new Date().toISOString()
            }
        });        
    } catch (error) {
        console.error('Error registrando inhabilitación de colaborador:', error);
    }
}

// Verificar límite de sucursal (máximo 2 colaboradores por sucursal)
async function verificarLimiteSucursal(sucursalId, organizacionCamelCase, colaboradorIdActual) {
    if (!sucursalId || !sucursalManager) return true;

    try {
        const userManager = new UserManager();
        const colaboradores = await userManager.getColaboradoresByOrganizacion(organizacionCamelCase, true);

        const colaboradoresEnSucursal = colaboradores.filter(colab =>
            colab.codigoColaborador === sucursalId && colab.id !== colaboradorIdActual
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

// ========== FUNCIONES PARA CÓDIGO DE COLABORADOR ==========

async function validarCodigoColaboradorEdicion(codigo, organizacionCamelCase, colaboradorIdActual) {
    if (!codigo || codigo.trim() === '') {
        return { valido: true, mensaje: '' };
    }
    
    if (!/^\d{3}$/.test(codigo)) {
        return { valido: false, mensaje: 'El código debe tener exactamente 3 dígitos (001-999)' };
    }
    
    const numero = parseInt(codigo, 10);
    if (numero < 1 || numero > 999) {
        return { valido: false, mensaje: 'El código debe estar entre 001 y 999' };
    }
    
    try {
        const userManager = new UserManager();
        const colaboradores = await userManager.getColaboradoresByOrganizacion(organizacionCamelCase, true);
        
        const existe = colaboradores.some(col => 
            col.codigoColaborador === codigo && col.id !== colaboradorIdActual
        );
        
        if (existe) {
            return { valido: false, mensaje: `El código ${codigo} ya está en uso por otro colaborador` };
        }
        
        return { valido: true, mensaje: '' };
        
    } catch (error) {
        console.error('Error validando código:', error);
        return { valido: true, mensaje: '' };
    }
}

function configurarValidacionCodigo(elements, organizacionCamelCase, colaboradorId) {
    if (!elements.codigoColaborador) return;
    
    const esCampoVisible = () => {
        const container = elements.codigoNormalContainer;
        return container && container.style.display !== 'none';
    };
    
    elements.codigoColaborador.addEventListener('input', async function(e) {
        if (!esCampoVisible()) return;
        
        this.value = this.value.replace(/[^0-9]/g, '').slice(0, 3);
        
        if (this.value.length === 0) {
            this.style.borderColor = '';
            const hint = this.closest('.form-field-group')?.querySelector('.field-hint');
            if (hint) {
                hint.style.color = '';
                hint.innerHTML = `<i class="fas fa-info-circle"></i> Código único de 3 dígitos (001-999). Déjalo vacío si no quieres asignar código.`;
            }
            return;
        }
        
        if (this.value.length === 3) {
            const validacion = await validarCodigoColaboradorEdicion(this.value, organizacionCamelCase, colaboradorId);
            if (!validacion.valido) {
                this.style.borderColor = 'var(--color-danger, #dc3545)';
                const hint = this.closest('.form-field-group')?.querySelector('.field-hint');
                if (hint) {
                    hint.style.color = 'var(--color-danger, #dc3545)';
                    hint.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${validacion.mensaje}`;
                }
            } else {
                this.style.borderColor = 'var(--color-success, #28a745)';
                const hint = this.closest('.form-field-group')?.querySelector('.field-hint');
                if (hint) {
                    hint.style.color = '';
                    hint.innerHTML = `<i class="fas fa-check-circle"></i> Código válido y disponible`;
                }
            }
        } else {
            this.style.borderColor = 'var(--color-warning, #ff9800)';
            const hint = this.closest('.form-field-group')?.querySelector('.field-hint');
            if (hint) {
                hint.style.color = 'var(--color-warning, #ff9800)';
                hint.innerHTML = `<i class="fas fa-info-circle"></i> El código debe tener exactamente 3 dígitos`;
            }
        }
    });
    
    elements.codigoColaborador.addEventListener('blur', function() {
        if (!esCampoVisible()) return;
        
        if (this.value.length > 0 && this.value.length !== 3) {
            this.value = '';
            this.style.borderColor = '';
            const hint = this.closest('.form-field-group')?.querySelector('.field-hint');
            if (hint) {
                hint.style.color = '';
                hint.innerHTML = `<i class="fas fa-info-circle"></i> Código único de 3 dígitos (001-999). Déjalo vacío si no quieres asignar código.`;
            }
        }
    });
}

// ==================== FUNCIONES PRINCIPALES ====================

async function iniciarEditor(userManager) {
    const collaboratorId = obtenerIdDesdeURL();
    if (!collaboratorId) return;

    const elements = obtenerElementosDOM();

    try {
        let usuarioActual = obtenerUsuarioActual();

        if (!usuarioActual) {
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
        configurarFotoPerfil(elements);
        configurarGuardado(elements, userManager);
        configurarCambioPassword(elements);
        configurarEliminacion(elements, userManager);
        configurarSelectorStatus(elements);
        configurarFiltroNumerico(elements);
        
        configurarValidacionCodigo(elements, usuarioActual.organizacionCamelCase, collaboratorId);

        await cargarAreas(elements);

    } catch (error) {
        console.error('❌ Error inicializando editor:', error);
        mostrarMensaje(elements.mainMessage, 'error',
            'Error al cargar datos del colaborador: ' + error.message);
    }
}

function configurarFiltroNumerico(elements) {
    if (elements.telefono) {
        elements.telefono.addEventListener('input', function () {
            this.value = this.value.replace(/[^0-9]/g, '').slice(0, 15);
        });
    }
}

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
        codigoColaborador: document.getElementById('codigoColaborador'),
        codigoNormalContainer: document.getElementById('codigoNormalContainer'),
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

        window.currentCollaborator = collaborator;
        window.colaboradorOriginal = JSON.parse(JSON.stringify(collaborator));
        pendingPhotoBase64 = null;

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

    if (elements.codigoColaborador) {
        elements.codigoColaborador.value = collaborator.codigoColaborador || '';        
    }

    if (elements.email && collaborator.correoElectronico) {
        elements.email.value = collaborator.correoElectronico;
    }

    if (elements.telefono) {
        elements.telefono.value = collaborator.telefono || '';        
    }

    if (elements.organizationName && collaborator.organizacion) {
        elements.organizationName.value = collaborator.organizacion;
    }

    let statusValue = collaborator.status === true || collaborator.status === 'active' ? 'active' : 'inactive';

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

    if (collaborator.fotoUsuario) {
        const profileUrl = collaborator.getFotoUrl();
        if (elements.profileImage) {
            elements.profileImage.src = profileUrl;
            elements.profileImage.style.display = 'block';
            elements.profileImage.onerror = function () {
                this.style.display = 'none';
                if (elements.profilePlaceholder) elements.profilePlaceholder.style.display = 'flex';
            };
        }
        if (elements.profilePlaceholder) elements.profilePlaceholder.style.display = 'none';
    }

    if (collaborator.fotoOrganizacion) {
        const orgUrl = collaborator.fotoOrganizacion;
        if (elements.orgImage) {
            elements.orgImage.src = orgUrl;
            elements.orgImage.style.display = 'block';
            elements.orgImage.onerror = function () {
                this.style.display = 'none';
                if (elements.orgPlaceholder) elements.orgPlaceholder.style.display = 'flex';
            };
        }
        if (elements.orgPlaceholder) elements.orgPlaceholder.style.display = 'none';
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
        const areasActivas = areas.filter(area => area.estado === 'activa');

        elements.areaSelect._areasData = areasActivas;

        if (areasActivas.length === 0) {
            elements.areaSelect.innerHTML = '<option value="">No hay áreas disponibles</option>';
            elements.areaSelect.disabled = false;
            return;
        }

        let options = '<option value="">Selecciona un área</option>';
        areasActivas.forEach(area => {
            options += `<option value="${area.id}" data-nombre="${area.nombreArea}">${area.nombreArea}</option>`;
        });
        elements.areaSelect.innerHTML = options;
        elements.areaSelect.disabled = false;

        if (collaborator.areaAsignadaId) {
            const areaExiste = areasActivas.some(a => a.id === collaborator.areaAsignadaId);
            if (areaExiste) {
                elements.areaSelect.value = collaborator.areaAsignadaId;
                const event = new Event('change', { bubbles: true });
                elements.areaSelect.dispatchEvent(event);

                const seleccionarCargo = () => {
                    if (collaborator.cargo && collaborator.cargo.id) {
                        const option = Array.from(elements.cargoEnAreaSelect.options).find(opt => opt.value === collaborator.cargo.id);
                        if (option) {
                            elements.cargoEnAreaSelect.value = option.value;
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
    }
}

function cargarCargosPorArea(elements) {
    if (!elements.areaSelect || !elements.cargoEnAreaSelect) return;

    const areaId = elements.areaSelect.value;
    const areaNombre = elements.areaSelect.options[elements.areaSelect.selectedIndex]?.getAttribute('data-nombre') || '';
    const areas = elements.areaSelect._areasData || [];

    elements.cargoEnAreaSelect.innerHTML = '';
    elements.cargoEnAreaSelect.disabled = true;

    if (elements.sucursalContainer) {
        elements.sucursalContainer.style.display = 'none';
    }
    if (elements.codigoNormalContainer) {
        elements.codigoNormalContainer.style.display = 'block';
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

    const todosLosCargos = areaSeleccionada.getCargosAsArray ? areaSeleccionada.getCargosAsArray() : [];
    const cargosActivos = todosLosCargos.filter(cargo => cargo.estado === 'activo');

    if (cargosActivos.length === 0) {
        elements.cargoEnAreaSelect.innerHTML = '<option value="">Esta área no tiene cargos activos</option>';
    } else {
        let options = '<option value="">Selecciona un cargo</option>';
        
        cargosActivos.forEach((cargo, index) => {
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

    const esAreaSucursales = areaNombre.toLowerCase() === 'sucursales' || areaNombre.toLowerCase() === 'sucursal';

    if (esAreaSucursales) {
        if (elements.codigoNormalContainer) {
            elements.codigoNormalContainer.style.display = 'none';
        }
        if (elements.sucursalContainer) {
            elements.sucursalContainer.style.display = 'block';
            cargarSucursales(elements);
        }
    } else {
        if (elements.codigoNormalContainer) {
            elements.codigoNormalContainer.style.display = 'block';
        }
        if (elements.sucursalContainer) {
            elements.sucursalContainer.style.display = 'none';
        }
    }
}

async function cargarSucursales(elements) {
    if (!elements.sucursalSelect || !sucursalManager) return;

    try {
        const usuarioActual = window.usuarioActual;
        const collaborator = window.currentCollaborator;

        if (!usuarioActual || !usuarioActual.organizacionCamelCase) return;

        // El código actual ES el ID de la sucursal si el área es sucursales
        const codigoActual = collaborator.codigoColaborador || null;

        elements.sucursalSelect.innerHTML = '<option value="">Cargando sucursales...</option>';
        elements.sucursalSelect.disabled = true;

        const sucursales = await sucursalManager.getSucursalesByOrganizacion(usuarioActual.organizacionCamelCase);

        if (sucursales.length === 0) {
            elements.sucursalSelect.innerHTML = '<option value="">No hay sucursales disponibles</option>';
            if (elements.sucursalHint) {
                elements.sucursalHint.innerHTML = '<i class="fas fa-exclamation-triangle"></i> No hay sucursales registradas.';
            }
            elements.sucursalSelect.disabled = true;
        } else {
            let options = '<option value="">Selecciona una sucursal</option>';
            let sucursalEncontrada = false;

            sucursales.forEach(sucursal => {
                const isSelected = (codigoActual === sucursal.id);
                if (isSelected) sucursalEncontrada = true;
                const selectedAttr = isSelected ? 'selected' : '';
                options += `<option value="${sucursal.id}" data-nombre="${sucursal.nombre}" data-ciudad="${sucursal.ciudad}" ${selectedAttr}>${sucursal.nombre} - ${sucursal.ciudad || 'Sin ciudad'}</option>`;
            });

            elements.sucursalSelect.innerHTML = options;
            elements.sucursalSelect.disabled = false;

            if (codigoActual && sucursalEncontrada) {
                if (elements.sucursalHint) {
                    const sucursalSeleccionada = sucursales.find(s => s.id === codigoActual);
                    if (sucursalSeleccionada) {
                        elements.sucursalHint.innerHTML = `<i class="fas fa-check-circle" style="color: #28a745;"></i> Sucursal asignada: ${sucursalSeleccionada.nombre}`;
                    }
                }
            } else if (codigoActual) {
                if (elements.sucursalHint) {
                    elements.sucursalHint.innerHTML = '<i class="fas fa-exclamation-triangle" style="color: #ff9800;"></i> La sucursal asignada ya no existe.';
                }
            } else {
                if (elements.sucursalHint) {
                    elements.sucursalHint.innerHTML = '<i class="fas fa-info-circle"></i> Selecciona la sucursal para asignar como código del colaborador';
                }
            }
        }

        if (elements.sucursalContainer) {
            elements.sucursalContainer.style.display = 'block';
        }

        elements.sucursalSelect._sucursalesData = sucursales;

    } catch (error) {
        console.error('❌ Error cargando sucursales:', error);
        elements.sucursalSelect.innerHTML = '<option value="">Error al cargar sucursales</option>';
        elements.sucursalSelect.disabled = true;
    }
}

function configurarSelectoresAreaCargo(elements) {
    if (!elements.areaSelect || !elements.cargoEnAreaSelect) return;

    elements.areaSelect.addEventListener('change', () => {
        cargarCargosPorArea(elements);
    });
}

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
                    window.history.back();
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
            elements.statusInput.value = this.getAttribute('data-status');
        });
    });
}

function configurarFotoPerfil(elements) {
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
            if (file) previsualizarFoto(file, elements);
            this.value = '';
        });
    }
}

function previsualizarFoto(file, elements) {
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
            title: '¿Usar esta foto?',
            html: `
                <div style="text-align: center;">
                    <img src="${imageBase64}" style="width: 150px; height: 150px; border-radius: 50%; object-fit: cover; border: 3px solid var(--color-accent-primary); margin-bottom: 15px;">
                    <p>La foto se guardará cuando confirmes los cambios.</p>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'APLICAR',
            cancelButtonText: 'CANCELAR'
        }).then(async (result) => {
            if (result.isConfirmed) {
                pendingPhotoBase64 = imageBase64;
                
                if (elements.profileImage) {
                    elements.profileImage.src = imageBase64;
                    elements.profileImage.style.display = 'block';
                }
                if (elements.profilePlaceholder) {
                    elements.profilePlaceholder.style.display = 'none';
                }
                
                mostrarMensaje(elements.mainMessage, 'success', 
                    'Foto seleccionada. Recuerda guardar los cambios.');
            }
        });
    };

    reader.readAsDataURL(file);
}

// ========== FUNCIÓN PRINCIPAL DE GUARDADO ==========

function configurarGuardado(elements, userManager) {
    if (!elements.saveChangesBtn || !window.currentCollaborator) return;

    elements.saveChangesBtn.addEventListener('click', async () => {
        if (!elements.fullName || !elements.fullName.value.trim()) {
            mostrarMensaje(elements.mainMessage, 'error', 'El nombre completo es obligatorio');
            return;
        }

        const collaborator = window.currentCollaborator;
        const colaboradorOriginal = window.colaboradorOriginal;
        const usuarioActual = window.usuarioActual;

        const nuevoNombre = elements.fullName.value.trim();
        const nuevoTelefono = elements.telefono?.value.trim() || '';
        const nuevoEstado = elements.statusInput.value === 'active';

        const areaSeleccionadaElement = elements.areaSelect.options[elements.areaSelect.selectedIndex];
        const areaSeleccionadaNombre = areaSeleccionadaElement?.getAttribute('data-nombre') || '';
        const esAreaSucursales = areaSeleccionadaNombre.toLowerCase() === 'sucursales' || areaSeleccionadaNombre.toLowerCase() === 'sucursal';

        let nuevoCodigo = '';

        if (esAreaSucursales) {
            if (elements.sucursalSelect && elements.sucursalSelect.value) {
                nuevoCodigo = elements.sucursalSelect.value;
            } else {
                nuevoCodigo = '';
            }
        } else {
            nuevoCodigo = elements.codigoColaborador?.value.trim() || '';
        }

        // Validar código solo si NO es área sucursales
        if (!esAreaSucursales && nuevoCodigo) {
            if (!/^\d{3}$/.test(nuevoCodigo)) {
                Swal.fire({ icon: 'error', title: 'Código inválido', text: 'El código debe tener exactamente 3 dígitos (001-999)' });
                return;
            }
            
            const numero = parseInt(nuevoCodigo, 10);
            if (numero < 1 || numero > 999) {
                Swal.fire({ icon: 'error', title: 'Código inválido', text: 'El código debe estar entre 001 y 999' });
                return;
            }
            
            const codigoValidacion = await validarCodigoColaboradorEdicion(
                nuevoCodigo,
                collaborator.organizacionCamelCase || usuarioActual.organizacionCamelCase,
                collaborator.id
            );
            
            if (!codigoValidacion.valido) {
                Swal.fire({ icon: 'error', title: 'Código inválido', text: codigoValidacion.mensaje });
                return;
            }
        }

        // Verificar límite de sucursal si es área sucursales y se seleccionó una
        if (esAreaSucursales && nuevoCodigo && usuarioActual.organizacionCamelCase) {
            const limiteOk = await verificarLimiteSucursal(nuevoCodigo, usuarioActual.organizacionCamelCase, collaborator.id);
            if (!limiteOk) {
                Swal.fire({
                    icon: 'error',
                    title: 'Límite alcanzado',
                    text: 'Esta sucursal ya tiene 2 colaboradores asignados. No se pueden asignar más.'
                });
                return;
            }
        }

        // Obtener área y cargo
        let areaId = null;
        const areas = elements.areaSelect._areasData || [];
        const areaSeleccionada = areas.find(a => a.id === elements.areaSelect?.value);
        if (areaSeleccionada) {
            areaId = areaSeleccionada.id;
        }

        let cargoObjeto = null;
        const cargosData = elements.cargoEnAreaSelect._cargosData || {};
        const cargoSeleccionado = cargosData[elements.cargoEnAreaSelect?.value];
        if (cargoSeleccionado) {
            cargoObjeto = {
                id: cargoSeleccionado.id || elements.cargoEnAreaSelect.value,
                nombre: cargoSeleccionado.nombre || 'Cargo sin nombre',
                descripcion: cargoSeleccionado.descripcion || ''
            };
        }

        // Detectar cambios
        const cambios = [];
        const codigoOriginal = colaboradorOriginal.codigoColaborador || '';

        if (colaboradorOriginal.nombreCompleto !== nuevoNombre) {
            cambios.push({ campo: 'nombre', anterior: colaboradorOriginal.nombreCompleto, nuevo: nuevoNombre });
        }
        if ((colaboradorOriginal.telefono || '') !== nuevoTelefono) {
            cambios.push({ campo: 'teléfono', anterior: colaboradorOriginal.telefono || 'No registrado', nuevo: nuevoTelefono || 'No registrado' });
        }
        if (codigoOriginal !== nuevoCodigo) {
            cambios.push({ campo: 'código', anterior: codigoOriginal || 'Sin código', nuevo: nuevoCodigo || 'Sin código' });
        }
        if ((colaboradorOriginal.status === true) !== nuevoEstado) {
            cambios.push({ campo: 'estado', anterior: colaboradorOriginal.status ? 'activo' : 'inactivo', nuevo: nuevoEstado ? 'activo' : 'inactivo' });
        }
        if ((colaboradorOriginal.areaAsignadaId || null) !== areaId) {
            cambios.push({ campo: 'área', anterior: colaboradorOriginal.areaAsignadaNombre || 'No asignada', nuevo: areaSeleccionada?.nombreArea || 'No asignada' });
        }
        if ((colaboradorOriginal.cargo?.nombre || 'No asignado') !== (cargoObjeto?.nombre || 'No asignado')) {
            cambios.push({ campo: 'cargo', anterior: colaboradorOriginal.cargo?.nombre || 'No asignado', nuevo: cargoObjeto?.nombre || 'No asignado' });
        }
        if (pendingPhotoBase64 !== null) {
            cambios.push({ campo: 'foto de perfil', anterior: 'Anterior', nuevo: 'Nueva foto' });
        }

        if (cambios.length === 0) {
            Swal.fire({ icon: 'info', title: 'Sin cambios', text: 'No se detectaron cambios', timer: 2000, showConfirmButton: false });
            return;
        }

        // Confirmar
        let confirmHtml = `<div style="text-align: left;"><p><strong>Nombre:</strong> ${nuevoNombre}</p>`;
        confirmHtml += `<p><strong>Código:</strong> ${nuevoCodigo || 'Sin código'}</p>`;
        confirmHtml += `<p><strong>Teléfono:</strong> ${nuevoTelefono || 'No especificado'}</p>`;
        confirmHtml += `<p><strong>Área:</strong> ${areaSeleccionada?.nombreArea || 'No asignada'}</p>`;
        confirmHtml += `<p><strong>Cargo:</strong> ${cargoObjeto?.nombre || 'No asignado'}</p>`;
        if (esAreaSucursales && nuevoCodigo) {
            const sucursalInfo = elements.sucursalSelect?._sucursalesData?.find(s => s.id === nuevoCodigo);
            confirmHtml += `<p><strong>Sucursal:</strong> ${sucursalInfo?.nombre || nuevoCodigo}</p>`;
        }
        confirmHtml += `<p><strong>Status:</strong> ${nuevoEstado ? 'Activo' : 'Inactivo'}</p>`;
        confirmHtml += `<div style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 8px;"><strong>Cambios:</strong> ${cambios.map(c => `<p>• ${c.campo}: ${c.anterior} → ${c.nuevo}</p>`).join('')}</div></div>`;

        const result = await Swal.fire({
            title: '¿Guardar cambios?',
            html: confirmHtml,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'GUARDAR',
            cancelButtonText: 'CANCELAR'
        });

        if (!result.isConfirmed) return;

        Swal.fire({ title: 'Guardando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        try {
            const updateData = {
                nombreCompleto: nuevoNombre,
                telefono: nuevoTelefono,
                codigoColaborador: nuevoCodigo,
                status: nuevoEstado,
                cargo: cargoObjeto,
                cargoId: cargoObjeto?.id || null,
                areaAsignadaId: areaId
            };

            if (pendingPhotoBase64) {
                updateData.fotoUsuario = pendingPhotoBase64;
            }

            await userManager.updateUser(
                collaborator.id,
                updateData,
                'colaborador',
                collaborator.organizacionCamelCase || usuarioActual.organizacionCamelCase
            );

            await registrarEdicionColaborador(colaboradorOriginal, updateData, cambios, usuarioActual);

            const cambioCodigo = cambios.find(c => c.campo === 'código');
            if (cambioCodigo) {
                await registrarCambioCodigo(colaboradorOriginal, cambioCodigo.anterior, cambioCodigo.nuevo, usuarioActual);
            }

            const cambioTelefono = cambios.find(c => c.campo === 'teléfono');
            if (cambioTelefono) {
                await registrarCambioTelefono(colaboradorOriginal, cambioTelefono.anterior, cambioTelefono.nuevo, usuarioActual);
            }

            if (pendingPhotoBase64) {
                await registrarCambioFotoPerfil(colaboradorOriginal, usuarioActual);
            }

            pendingPhotoBase64 = null;
            window.colaboradorOriginal = JSON.parse(JSON.stringify({ ...collaborator, ...updateData }));

            Swal.close();
            await Swal.fire({ icon: 'success', title: '¡Éxito!', text: 'Datos actualizados correctamente', timer: 2000, showConfirmButton: false });
            window.history.back();

        } catch (error) {
            console.error('❌ Error guardando:', error);
            Swal.close();
            Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudieron guardar los cambios: ' + error.message });
        }
    });
}

// Cambiar contraseña
function configurarCambioPassword(elements) {
    if (!elements.changePasswordBtn) return;

    elements.changePasswordBtn.addEventListener('click', async () => {
        if (!window.currentCollaborator) {
            mostrarMensaje(elements.mainMessage, 'error', 'No hay colaborador cargado');
            return;
        }

        const collaborator = window.currentCollaborator;
        const userEmail = collaborator.correoElectronico;

        if (!userEmail) {
            mostrarMensaje(elements.mainMessage, 'error', 'No se encontró el correo');
            return;
        }

        const result = await Swal.fire({
            title: '¿Enviar enlace?',
            html: `<p>Correo: <strong>${userEmail}</strong></p><p>El enlace expirará en 1 hora.</p>`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'ENVIAR',
            cancelButtonText: 'CANCELAR'
        });

        if (!result.isConfirmed) return;

        Swal.fire({ title: 'Enviando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        try {
            const firebaseModule = await import('/config/firebase-config.js');
            const { sendPasswordResetEmail } = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js");

            await sendPasswordResetEmail(firebaseModule.auth, userEmail, {
                url: window.location.origin + '/verifyEmail.html',
                handleCodeInApp: false
            });

            Swal.close();
            await Swal.fire({ icon: 'success', title: 'Enviado', text: `Se envió un enlace a ${userEmail}` });

        } catch (error) {
            Swal.close();
            Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo enviar el correo' });
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
            html: `<p><strong>${fullName}</strong></p><p>${collaborator.correoElectronico}</p><p>No podrá iniciar sesión.</p>`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'INHABILITAR',
            cancelButtonText: 'CANCELAR'
        });

        if (!result.isConfirmed) return;

        Swal.fire({ title: 'Inhabilitando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        try {
            await userManager.inactivarUsuario(
                collaborator.id,
                'colaborador',
                collaborator.organizacionCamelCase || usuarioActual.organizacionCamelCase
            );

            await registrarInhabilitacionColaborador(collaborator, usuarioActual);

            Swal.close();
            await Swal.fire({ icon: 'success', title: 'Inhabilitado', text: `${fullName} ha sido inhabilitado`, timer: 2000 });
            window.location.href = '../usuarios/usuarios.html';

        } catch (error) {
            Swal.close();
            Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo inhabilitar' });
        }
    });
}