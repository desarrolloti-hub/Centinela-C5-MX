// ARCHIVO JS PARA CREAR COLABORADOR - VERSIÓN CORREGIDA (SIN DOBLE SELECCIÓN)
// CON REGISTRO DE BITÁCORA Y CAMPO TELÉFONO NUMÉRICO
// CON SUCURSALES - SOLO SI EL ÁREA ES "SUCURSALES"
// ROL ELIMINADO - AHORA SE USA UN ROL POR DEFECTO "colaborador"
// ==================== IMPORTS CORREGIDOS ====================
import { UserManager } from '/clases/user.js';
import { AreaManager } from '/clases/area.js';

let historialManager = null; // ✅ NUEVO: Para registrar actividades
let sucursalManager = null; // ✅ NUEVO: Para manejo de sucursales

// ==================== INICIALIZACIÓN ====================
document.addEventListener('DOMContentLoaded', function () {
    if (typeof Swal === 'undefined') {
        return;
    }

    // ✅ NUEVO: Inicializar historialManager y sucursalManager
    inicializarManagers().then(() => {
        initCollaboratorForm();
    });
});

// ✅ NUEVO: Inicializar historialManager y sucursalManager
async function inicializarManagers() {
    try {
        const { HistorialUsuarioManager } = await import('/clases/historialUsuario.js');
        historialManager = new HistorialUsuarioManager();
    } catch (error) {
        // Error handling without console
    }

    try {
        const { SucursalManager } = await import('/clases/sucursal.js');
        sucursalManager = new SucursalManager();
    } catch (error) {
        // Error handling without console
    }
}

// ========== FUNCIÓN PARA FILTRAR SOLO NÚMEROS ==========
function configurarFiltroNumerico(elements) {
    if (elements.telefono) {
        elements.telefono.addEventListener('input', function (e) {
            // Eliminar cualquier carácter que no sea número
            this.value = this.value.replace(/[^0-9]/g, '');

            // Validar longitud máxima (15 dígitos)
            if (this.value.length > 15) {
                this.value = this.value.slice(0, 15);
            }
        });

        // Prevenir pegado de texto con caracteres no numéricos
        elements.telefono.addEventListener('paste', function (e) {
            e.preventDefault();
            const pastedText = (e.clipboardData || window.clipboardData).getData('text');
            const numericOnly = pastedText.replace(/[^0-9]/g, '');
            if (numericOnly) {
                this.value = numericOnly.slice(0, 15);
                // Disparar evento input para actualizar validación
                const inputEvent = new Event('input', { bubbles: true });
                this.dispatchEvent(inputEvent);
            }
        });

        // Prevenir entrada de caracteres no numéricos en tiempo real
        elements.telefono.addEventListener('keypress', function (e) {
            const key = e.key;
            // Permitir teclas de control (backspace, delete, tab, etc.)
            if (e.ctrlKey || e.altKey || e.metaKey) return;
            if (key === 'Backspace' || key === 'Delete' || key === 'Tab' || key === 'ArrowLeft' || key === 'ArrowRight') return;

            // Solo permitir números
            if (!/^[0-9]$/.test(key)) {
                e.preventDefault();
            }
        });
    }
}

async function initCollaboratorForm() {

    // Obtener elementos del DOM
    const elements = obtenerElementosDOM();
    if (!elements) return;

    // Configurar filtro de solo números para teléfono
    configurarFiltroNumerico(elements);

    // Instanciar UserManager
    const userManager = new UserManager();

    try {
        // Obtener usuario actual (temporal - será reemplazado por componente Auth)
        const usuarioActual = obtenerUsuarioActual();

        if (!usuarioActual) {
            usuarioActual = {
                id: `usuario_${Date.now()}`,
                uid: `usuario_${Date.now()}`,
                nombreCompleto: 'Usuario',
                organizacion: 'Mi Organización',
                organizacionCamelCase: 'miOrganizacion',
                correoElectronico: 'usuario@ejemplo.com',
                fotoOrganizacion: null,
                plan: 'gratis'
            };
        }

        window.usuarioActual = usuarioActual;

        // Configurar interfaz con datos del usuario
        actualizarInterfazConUsuario(elements, usuarioActual);

        // Cargar áreas desde Firebase usando AreaManager
        await cargarAreas(elements, usuarioActual);

        // Configurar handlers
        configurarHandlers(elements, userManager, usuarioActual);

    } catch (error) {
        mostrarErrorSistema(error.message);
    }
}

// ✅ NUEVO: Registrar creación de colaborador
async function registrarCreacionColaborador(colaboradorData, usuarioActual) {
    if (!historialManager) return;

    try {
        await historialManager.registrarActividad({
            usuario: usuarioActual,
            tipo: 'crear',
            modulo: 'usuarios',
            descripcion: `Creó colaborador: ${colaboradorData.nombreCompleto}`,
            detalles: {
                colaboradorId: colaboradorData.id || 'pendiente',
                colaboradorNombre: colaboradorData.nombreCompleto,
                colaboradorEmail: colaboradorData.correoElectronico,
                colaboradorTelefono: colaboradorData.telefono || 'No especificado',
                colaboradorRol: 'colaborador', // Rol fijo por defecto
                areaAsignadaId: colaboradorData.areaAsignadaId || null,
                sucursalAsignadaId: colaboradorData.sucursalAsignadaId || null,
                fechaCreacion: new Date().toISOString()
            }
        });
    } catch (error) {
        // Error handling without console
    }
}

// ========== OBTENER USUARIO ACTUAL (TEMP) ==========
function obtenerUsuarioActual() {
    // TODO: Reemplazar con llamado al componente Auth
    try {
        // Intentar obtener de localStorage primero
        const adminInfo = JSON.parse(localStorage.getItem('adminInfo') || '{}');
        if (adminInfo && Object.keys(adminInfo).length > 0) {
            return {
                id: adminInfo.id || adminInfo.uid || `admin_${Date.now()}`,
                uid: adminInfo.uid || adminInfo.id,
                nombreCompleto: adminInfo.nombreCompleto || 'Administrador',
                organizacion: adminInfo.organizacion || 'Mi Organización',
                organizacionCamelCase: adminInfo.organizacionCamelCase || generarCamelCase(adminInfo.organizacion),
                correoElectronico: adminInfo.correoElectronico || '',
                fotoOrganizacion: adminInfo.fotoOrganizacion || null,
                plan: adminInfo.plan || 'gratis'
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
                correoElectronico: userData.correo || userData.email || '',
                fotoOrganizacion: userData.fotoOrganizacion || null,
                plan: userData.plan || 'gratis'
            };
        }

        // Si no hay datos, retornar null para usar valores por defecto
        return null;

    } catch (error) {
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

// ========== FUNCIONES DE UTILIDAD ==========

function obtenerElementosDOM() {
    try {
        return {
            // Fotos
            profileCircle: document.getElementById('profileCircle'),
            profilePlaceholder: document.getElementById('profilePlaceholder'),
            profileImage: document.getElementById('profileImage'),
            editProfileOverlay: document.getElementById('editProfileOverlay'),
            profileInput: document.getElementById('profile-input'),

            // Logo de organización (heredado)
            orgCircle: document.getElementById('orgCircle'),
            orgPlaceholder: document.getElementById('orgPlaceholder'),
            orgImage: document.getElementById('orgImage'),
            editOrgOverlay: document.getElementById('editOrgOverlay'),
            orgInfoText: document.getElementById('orgInfoText'),

            // Campos del formulario
            organization: document.getElementById('organization'),
            nombreCompleto: document.getElementById('nombreCompleto'),
            correoElectronico: document.getElementById('correoElectronico'),
            telefono: document.getElementById('telefono'), // Nuevo campo
            // NOTA: El campo 'rol' ha sido ELIMINADO
            areaSelect: document.getElementById('areaSelect'),
            cargoEnAreaSelect: document.getElementById('cargoEnAreaSelect'),
            sucursalContainer: document.getElementById('sucursalContainer'),
            sucursalSelect: document.getElementById('sucursalSelect'),
            sucursalHint: document.getElementById('sucursalHint'),

            contrasena: document.getElementById('contrasena'),
            confirmarContrasena: document.getElementById('confirmarContrasena'),

            // Botones y mensajes
            registerBtn: document.getElementById('registerBtn'),
            cancelBtn: document.getElementById('cancelBtn'),
            mainMessage: document.getElementById('mainMessage'),
            registerForm: document.getElementById('registerForm'),

            // Títulos
            adminNameSubtitle: document.getElementById('adminNameSubtitle'),
            formMainTitle: document.getElementById('formMainTitle'),
            formSubTitle: document.getElementById('formSubTitle'),

            // Toggle de contraseñas
            toggleContrasenaBtns: document.querySelectorAll('.toggle-contrasena')
        };
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: 'Error de configuración',
            text: 'No se pudieron cargar los elementos del formulario.'
        });
        return null;
    }
}

function actualizarInterfazConUsuario(elements, usuario) {
    // Actualizar campo de organización (solo lectura)
    if (elements.organization) {
        elements.organization.value = usuario.organizacion;
        elements.organization.classList.add('readonly-field');
    }

    // Actualizar nombre del usuario en el subtítulo
    if (elements.adminNameSubtitle) {
        elements.adminNameSubtitle.textContent = `Usuario: ${usuario.nombreCompleto} | ${usuario.organizacion}`;
    }

    // Cargar logo de organización heredado
    if (usuario.fotoOrganizacion && elements.orgCircle && elements.orgPlaceholder && elements.orgImage) {
        try {
            elements.orgPlaceholder.style.display = 'none';
            elements.orgImage.src = usuario.fotoOrganizacion;
            elements.orgImage.style.display = 'block';

            // Deshabilitar interacción con el logo
            elements.orgCircle.classList.add('org-disabled');
            if (elements.editOrgOverlay) {
                elements.editOrgOverlay.style.display = 'none';
            }

            // Actualizar texto informativo
            if (elements.orgInfoText) {
                elements.orgInfoText.textContent = 'Logo heredado. Los colaboradores verán este logo.';
            }

        } catch (error) {
            // Error handling without console
        }
    }

    // Actualizar títulos con información del usuario
    if (elements.formMainTitle) {
        elements.formMainTitle.textContent = `CREAR COLABORADOR PARA ${usuario.organizacion.toUpperCase()}`;
    }

    if (elements.formSubTitle) {
        elements.formSubTitle.textContent = `Completa los datos para crear un colaborador en ${usuario.organizacion}`;
    }

    // Mostrar mensaje informativo
    mostrarMensajeInfoUsuario(elements.mainMessage, usuario);
}

function mostrarMensajeInfoUsuario(element, usuario) {
    if (!element) return;

    element.innerHTML = `
        <div class="message-container info" style="display: block;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                <i class="fas fa-user"></i>
                <strong>Creando colaborador</strong>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.85rem;">
                <div><strong>Usuario:</strong> ${usuario.nombreCompleto}</div>
                <div><strong>Organización:</strong> ${usuario.organizacion}</div>
                <div><strong>Plan:</strong> ${usuario.plan ? usuario.plan.toUpperCase() : 'GRATIS'}</div>
            </div>
            <div style="margin-top: 8px; padding: 8px; background: var(--color-bg-secondary); border-radius: 4px; font-size: 0.8rem;">
                <i class="fas fa-info-circle" style="margin-right: 5px;"></i>
                El colaborador heredará estos datos de la organización.
            </div>
        </div>
    `;
    element.style.display = 'block';
}

// ========== FUNCIONES PARA CARGAR ÁREAS Y CARGOS ==========

async function cargarAreas(elements, usuario) {
    if (!elements.areaSelect) return;

    try {
        const areaManager = new AreaManager();

        elements.areaSelect.innerHTML = '<option value="">Cargando áreas...</option>';
        elements.areaSelect.disabled = true;
        elements.cargoEnAreaSelect.innerHTML = '<option value="">Primero selecciona un área</option>';
        elements.cargoEnAreaSelect.disabled = true;

        const areas = await areaManager.getAreasByOrganizacion(usuario.organizacionCamelCase);

        // Guardar las áreas en el elemento select para usarlas después
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

    } catch (error) {
        elements.areaSelect.innerHTML = '<option value="">Error al cargar áreas</option>';
        elements.areaSelect.disabled = false;

        Swal.fire({
            icon: 'warning',
            title: 'Error al cargar áreas',
            text: 'No se pudieron cargar las áreas. Puedes continuar sin asignar área.',
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
            const cargoId = cargo.id || `cargo_${index}_${Date.now()}`;
            options += `<option value="${cargoId}">${cargo.nombre || 'Cargo sin nombre'}</option>`;

            if (!elements.cargoEnAreaSelect._cargosData) {
                elements.cargoEnAreaSelect._cargosData = {};
            }
            elements.cargoEnAreaSelect._cargosData[cargoId] = cargo;
        });
        elements.cargoEnAreaSelect.innerHTML = options;
    }

    elements.cargoEnAreaSelect.disabled = false;

    // ✅ NUEVO: Verificar si el área seleccionada es "sucursales" para mostrar el campo de sucursal
    if (areaNombre.toLowerCase() === 'sucursales' || areaNombre.toLowerCase() === 'sucursal') {
        cargarSucursales(elements);
    }
}

// ✅ NUEVO: Cargar sucursales para asociar al colaborador
async function cargarSucursales(elements) {
    if (!elements.sucursalSelect || !sucursalManager) return;

    try {
        const usuarioActual = window.usuarioActual;
        if (!usuarioActual || !usuarioActual.organizacionCamelCase) {
            return;
        }

        elements.sucursalSelect.innerHTML = '<option value="">Cargando sucursales...</option>';
        elements.sucursalSelect.disabled = true;

        const sucursales = await sucursalManager.getSucursalesByOrganizacion(usuarioActual.organizacionCamelCase);

        if (sucursales.length === 0) {
            elements.sucursalSelect.innerHTML = '<option value="">No hay sucursales disponibles</option>';
            if (elements.sucursalHint) {
                elements.sucursalHint.innerHTML = '<i class="fas fa-exclamation-triangle"></i> No hay sucursales registradas. Crea una sucursal primero.';
            }
        } else {
            let options = '<option value="">Selecciona una sucursal (opcional)</option>';
            sucursales.forEach(sucursal => {
                options += `<option value="${sucursal.id}" data-nombre="${sucursal.nombre}" data-ciudad="${sucursal.ciudad}">${sucursal.nombre} - ${sucursal.ciudad || 'Sin ciudad'}</option>`;
            });
            elements.sucursalSelect.innerHTML = options;
            elements.sucursalSelect.disabled = false;

            if (elements.sucursalHint) {
                elements.sucursalHint.innerHTML = '<i class="fas fa-info-circle"></i> Opcional. Selecciona la sucursal a la que pertenecerá';
            }
        }

        // Mostrar el contenedor de sucursal
        if (elements.sucursalContainer) {
            elements.sucursalContainer.style.display = 'block';
        }

        // Guardar lista de sucursales para validaciones posteriores
        elements.sucursalSelect._sucursalesData = sucursales;

    } catch (error) {
        elements.sucursalSelect.innerHTML = '<option value="">Error al cargar sucursales</option>';
        if (elements.sucursalHint) {
            elements.sucursalHint.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error al cargar sucursales';
        }
    }
}

// ✅ NUEVO: Verificar que la sucursal no tenga más de 2 colaboradores asignados
async function verificarLimiteSucursal(sucursalId, organizacionCamelCase) {
    if (!sucursalId || !sucursalManager) return true;

    try {
        // Obtener todos los colaboradores de la organización
        const { UserManager } = await import('/clases/user.js');
        const userManager = new UserManager();

        const colaboradores = await userManager.getColaboradoresByOrganizacion(organizacionCamelCase, true);

        // Contar cuántos colaboradores tienen esta sucursal asignada
        const colaboradoresEnSucursal = colaboradores.filter(colab =>
            colab.sucursalAsignadaId === sucursalId
        );

        if (colaboradoresEnSucursal.length >= 2) {
            return false;
        }

        return true;

    } catch (error) {
        return true; // Si hay error, permitir continuar
    }
}

// ========== MANEJO DE IMÁGENES CON SWEETALERT2 ==========

function configurarHandlers(elements, userManager, usuario) {
    // Foto de perfil
    if (elements.editProfileOverlay && elements.profileInput) {
        elements.editProfileOverlay.addEventListener('click', () => elements.profileInput.click());
        elements.profileCircle.addEventListener('click', () => elements.profileInput.click());

        // IMPORTANTE: No limpiar el input aquí, solo cuando se abre
        elements.profileInput.addEventListener('click', function (e) {
            // Detener propagación para evitar eventos múltiples
            e.stopPropagation();
            // Limpiar solo cuando se abre el selector
            this.value = '';
        });

        // Usar { once: false } pero asegurar que no se acumulen eventos
        elements.profileInput.removeEventListener('change', manejarCambioFoto);
        elements.profileInput.addEventListener('change', function (e) {
            manejarCambioFoto(e, elements);
        });
    }

    // Mostrar/ocultar contraseña
    if (elements.toggleContrasenaBtns) {
        elements.toggleContrasenaBtns.forEach(btn => {
            btn.addEventListener('click', function () {
                const targetId = this.getAttribute('data-target');
                const input = document.getElementById(targetId);
                const icon = this.querySelector('i');

                if (input && icon) {
                    input.type = input.type === 'password' ? 'text' : 'password';
                    icon.classList.toggle('fa-eye');
                    icon.classList.toggle('fa-eye-slash');
                }
            });
        });
    }

    // Evento para cuando cambia el área seleccionada
    if (elements.areaSelect) {
        elements.areaSelect.addEventListener('change', () => cargarCargosPorArea(elements));
    }

    // Validación en tiempo real
    configurarValidacionTiempoReal(elements);

    // Botón de registro
    if (elements.registerBtn) {
        elements.registerBtn.addEventListener('click', (e) => registrarColaborador(e, elements, userManager, usuario));
    }

    // Botón cancelar
    if (elements.cancelBtn) {
        elements.cancelBtn.addEventListener('click', () => cancelarRegistro());
    }
}

// Variable para controlar que no se procese el mismo archivo múltiples veces
let procesandoFoto = false;

function manejarCambioFoto(event, elements) {
    // Prevenir procesamiento múltiple
    if (procesandoFoto) return;

    const file = event.target.files[0];
    if (!file) return;

    procesandoFoto = true;

    // Validar archivo
    if (!validarArchivo(file, 5)) {
        elements.profileInput.value = '';
        procesandoFoto = false;
        return;
    }

    const reader = new FileReader();

    reader.onload = function (e) {
        const imageBase64 = e.target.result;

        Swal.fire({
            title: 'Confirmar foto de perfil',
            html: `
                <div style="text-align: center;">
                    <img src="${imageBase64}" style="width: 150px; height: 150px; border-radius: 50%; object-fit: cover; border: 3px solid var(--color-accent-primary); margin-bottom: 15px;">
                    <p>¿Deseas usar esta imagen como foto de perfil del colaborador?</p>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'CONFIRMAR',
            cancelButtonText: 'CANCELAR'
        }).then((result) => {
            if (result.isConfirmed) {
                actualizarFotoPerfil(imageBase64, elements);
            }
            // SIEMPRE limpiar el input y resetear la bandera
            elements.profileInput.value = '';
            procesandoFoto = false;
        }).catch(() => {
            // En caso de error, también limpiar
            elements.profileInput.value = '';
            procesandoFoto = false;
        });
    };

    reader.onerror = function () {
        elements.profileInput.value = '';
        procesandoFoto = false;
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo leer el archivo'
        });
    };

    reader.readAsDataURL(file);
}

function validarArchivo(file, maxSizeMB) {
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const maxSize = maxSizeMB * 1024 * 1024;

    if (!validTypes.includes(file.type)) {
        Swal.fire({
            icon: 'error',
            title: 'Formato no válido',
            text: 'Solo se permiten archivos JPG, PNG, GIF o WebP',
            confirmButtonText: 'ENTENDIDO'
        });
        return false;
    }

    if (file.size > maxSize) {
        Swal.fire({
            icon: 'error',
            title: 'Archivo demasiado grande',
            text: `El archivo excede el tamaño máximo permitido (${maxSizeMB}MB)`,
            confirmButtonText: 'ENTENDIDO'
        });
        return false;
    }

    return true;
}

function actualizarFotoPerfil(imageSrc, elements) {
    if (elements.profilePlaceholder && elements.profileImage) {
        elements.profilePlaceholder.style.display = 'none';
        elements.profileImage.src = imageSrc;
        elements.profileImage.style.display = 'block';

        Swal.fire({
            icon: 'success',
            title: '¡Foto cargada!',
            text: 'La foto de perfil se ha cargado correctamente',
            timer: 2000,
            showConfirmButton: false
        });
    }
}

// ========== VALIDACIÓN ==========

function configurarValidacionTiempoReal(elements) {
    // Validar teléfono en tiempo real (solo números)
    if (elements.telefono) {
        elements.telefono.addEventListener('input', function () {
            if (this.value) {
                // Validar que solo tenga números y longitud adecuada
                const isValid = /^[0-9]{8,15}$/.test(this.value);
                this.style.borderColor = isValid ? 'var(--color-success, #28a745)' : 'var(--color-danger, #dc3545)';
            } else {
                this.style.borderColor = '';
            }
        });
    }

    // Validar coincidencia de contraseñas
    if (elements.confirmarContrasena) {
        elements.confirmarContrasena.addEventListener('input', function () {
            if (elements.contrasena.value && this.value) {
                this.style.borderColor = elements.contrasena.value === this.value ? 'var(--color-success, #28a745)' : 'var(--color-danger, #dc3545)';
            } else {
                this.style.borderColor = '';
            }
        });
    }

    // Validar email
    if (elements.correoElectronico) {
        elements.correoElectronico.addEventListener('blur', function () {
            if (this.value) {
                const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.value);
                this.style.borderColor = isValid ? 'var(--color-success, #28a745)' : 'var(--color-danger, #dc3545)';
            } else {
                this.style.borderColor = '';
            }
        });
    }
}

function validarFormulario(elements) {
    const errores = [];

    // Nombre completo
    if (!elements.nombreCompleto.value.trim()) {
        errores.push('El nombre completo es obligatorio');
    } else if (elements.nombreCompleto.value.trim().length < 5) {
        errores.push('El nombre completo debe tener al menos 5 caracteres');
    }

    // Email
    if (!elements.correoElectronico.value.trim()) {
        errores.push('El correo electrónico es obligatorio');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(elements.correoElectronico.value)) {
        errores.push('El correo electrónico no es válido');
    }

    // Teléfono (validación: solo números, entre 8 y 15 dígitos)
    if (elements.telefono && elements.telefono.value.trim()) {
        if (!/^[0-9]{8,15}$/.test(elements.telefono.value.trim())) {
            errores.push('El teléfono debe contener solo números y tener entre 8 y 15 dígitos');
        }
    }

    // Contraseña
    if (!elements.contrasena.value) {
        errores.push('La contraseña es obligatoria');
    } else if (!validarContrasena(elements.contrasena.value)) {
        errores.push('La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula, un número y un carácter especial');
    }

    // Confirmar contraseña
    if (!elements.confirmarContrasena.value) {
        errores.push('Debes confirmar la contraseña');
    } else if (elements.contrasena.value !== elements.confirmarContrasena.value) {
        errores.push('Las contraseñas no coinciden');
    }

    // NOTA: La validación del campo ROL ha sido eliminada
    // El rol se asignará automáticamente como "colaborador"

    return errores;
}

function validarContrasena(password) {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    return password.length >= minLength &&
        hasUpperCase &&
        hasLowerCase &&
        hasNumber &&
        hasSpecialChar;
}

// ========== REGISTRO DE COLABORADOR ==========

async function registrarColaborador(event, elements, userManager, usuario) {
    event.preventDefault();

    // Validar formulario
    const errores = validarFormulario(elements);
    if (errores.length > 0) {
        Swal.fire({
            icon: 'error',
            title: 'Error de validación',
            html: errores.map(msg => `• ${msg}`).join('<br>'),
            confirmButtonText: 'CORREGIR'
        });
        return;
    }

    // Obtener datos del área y cargo seleccionados (si existen)
    let areaNombre = 'No asignada';
    let cargoNombre = 'No asignado';
    let cargoDescripcion = '';
    let cargoObjeto = null;
    let areaId = null;

    if (elements.areaSelect && elements.areaSelect.value) {
        areaId = elements.areaSelect.value;
        const areas = elements.areaSelect._areasData || [];
        const areaSeleccionada = areas.find(a => a.id === areaId);
        if (areaSeleccionada) {
            areaNombre = areaSeleccionada.nombreArea;
        }
    }

    if (elements.cargoEnAreaSelect && elements.cargoEnAreaSelect.value) {
        const cargosData = elements.cargoEnAreaSelect._cargosData || {};
        const cargoSeleccionado = cargosData[elements.cargoEnAreaSelect.value];
        if (cargoSeleccionado) {
            cargoNombre = cargoSeleccionado.nombre || 'Cargo sin nombre';
            cargoDescripcion = cargoSeleccionado.descripcion || '';
            cargoObjeto = {
                id: cargoSeleccionado.id || elements.cargoEnAreaSelect.value,
                nombre: cargoNombre,
                descripcion: cargoDescripcion
            };
        }
    }

    // ✅ NUEVO: Obtener datos de sucursal si está seleccionada y visible
    let sucursalId = null;
    let sucursalNombre = null;
    let sucursalCiudad = null;
    let esAreaSucursales = false;

    // Verificar si el área seleccionada es "sucursales"
    const areaSeleccionadaElement = elements.areaSelect.options[elements.areaSelect.selectedIndex];
    const areaSeleccionadaNombre = areaSeleccionadaElement?.getAttribute('data-nombre') || '';
    esAreaSucursales = areaSeleccionadaNombre.toLowerCase() === 'sucursales' || areaSeleccionadaNombre.toLowerCase() === 'sucursal';

    if (esAreaSucursales && elements.sucursalSelect && elements.sucursalSelect.value) {
        sucursalId = elements.sucursalSelect.value;

        // Obtener nombre y ciudad de la sucursal seleccionada
        const sucursalesData = elements.sucursalSelect._sucursalesData || [];
        const sucursalSeleccionada = sucursalesData.find(s => s.id === sucursalId);
        if (sucursalSeleccionada) {
            sucursalNombre = sucursalSeleccionada.nombre;
            sucursalCiudad = sucursalSeleccionada.ciudad;
        }

        // Verificar límite de colaboradores por sucursal (máximo 2)
        if (sucursalId && usuario.organizacionCamelCase) {
            const limiteOk = await verificarLimiteSucursal(sucursalId, usuario.organizacionCamelCase);
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

    // Mostrar confirmación
    let confirmHtml = `
        <div style="text-align: left; padding: 10px 0;">
            <p><strong>Nombre:</strong> ${elements.nombreCompleto.value.trim()}</p>
            <p><strong>Email:</strong> ${elements.correoElectronico.value.trim()}</p>
            <p><strong>Teléfono:</strong> ${elements.telefono?.value.trim() || 'No especificado'}</p>
            <p><strong>Rol en sistema:</strong> Colaborador (asignado automáticamente)</p>
            <p><strong>Área asignada:</strong> ${areaNombre}</p>
            <p><strong>Cargo en el área:</strong> ${cargoNombre}</p>
    `;

    if (esAreaSucursales) {
        confirmHtml += `<p><strong>Sucursal asignada:</strong> ${sucursalNombre ? `${sucursalNombre}${sucursalCiudad ? ` (${sucursalCiudad})` : ''}` : 'No asignada'}</p>`;
    }

    confirmHtml += `
            <p style="color: var(--color-warning, #ff9800); margin-top: 15px;">
                <i class="fas fa-exclamation-triangle"></i> Se enviará un correo de verificación al colaborador.
            </p>
        </div>
    `;

    const confirmResult = await Swal.fire({
        title: 'Crear colaborador',
        html: confirmHtml,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'CONFIRMAR',
        cancelButtonText: 'CANCELAR',
        allowOutsideClick: false
    });

    if (!confirmResult.isConfirmed) return;

    // Mostrar loader
    Swal.fire({
        title: 'Creando colaborador...',
        text: 'Esto puede tomar unos segundos. Por favor espera...',
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const colaboradorData = {
            nombreCompleto: elements.nombreCompleto.value.trim(),
            correoElectronico: elements.correoElectronico.value.trim(),
            telefono: elements.telefono?.value.trim() || '', // Nuevo campo - solo números
            fotoUsuario: elements.profileImage.src || null,

            // Campos heredados del usuario
            organizacion: usuario.organizacion,
            organizacionCamelCase: usuario.organizacionCamelCase,
            fotoOrganizacion: usuario.fotoOrganizacion,
            theme: usuario.theme || 'light',
            plan: usuario.plan || 'gratis',

            // Usar el objeto cargo para la información del puesto
            cargo: cargoObjeto,

            // Solo el ID del área, no el nombre
            areaAsignadaId: areaId,

            // ✅ NUEVO: Sucursal asignada (solo si el área es sucursales)
            sucursalAsignadaId: sucursalId,
            sucursalAsignadaNombre: sucursalNombre,
            sucursalAsignadaCiudad: sucursalCiudad,

            // ROL POR DEFECTO: "colaborador" (campo eliminado del formulario)
            rol: 'colaborador',

            // Campos de sistema
            status: true,

            // Campos de trazabilidad
            creadoPor: usuario.id,
            creadoPorEmail: usuario.correoElectronico,
            creadoPorNombre: usuario.nombreCompleto,
            fechaCreacion: new Date(),

            // Permisos básicos
            permisosPersonalizados: {
                dashboard: true,
                verPerfil: true,
                verOrganizacion: true,
                actualizarPerfil: false,
                crearContenido: false
            }
        };

        // Crear colaborador usando UserManager
        const resultado = await userManager.createColaborador(
            colaboradorData,
            elements.contrasena.value,
            usuario.id
        );

        // ✅ NUEVO: Registrar creación en bitácora
        if (resultado && resultado.id) {
            colaboradorData.id = resultado.id;
            await registrarCreacionColaborador(colaboradorData, usuario);
        }

        // Mostrar éxito
        Swal.close();
        await mostrarExitoRegistro(colaboradorData, esAreaSucursales, sucursalNombre);

    } catch (error) {
        Swal.close();
        manejarErrorRegistro(error);
    }
}

async function mostrarExitoRegistro(colaboradorData, esAreaSucursales = false, sucursalNombre = null) {
    let mensajeSucursal = '';
    if (esAreaSucursales && sucursalNombre) {
        mensajeSucursal = `<p><strong>Sucursal:</strong> ${sucursalNombre}</p>`;
    }

    const result = await Swal.fire({
        icon: 'success',
        title: '¡Colaborador creado!',
        html: `
            <div style="text-align: center;">
                <p><strong>Nombre:</strong> ${colaboradorData.nombreCompleto}</p>
                <p><strong>Email:</strong> ${colaboradorData.correoElectronico}</p>
                <p><strong>Teléfono:</strong> ${colaboradorData.telefono || 'No especificado'}</p>
                <p><strong>Organización:</strong> ${colaboradorData.organizacion}</p>
                <p><strong>Rol:</strong> Colaborador</p>
                ${mensajeSucursal}
                <p style="margin-top: 15px;"><i class="fas fa-envelope"></i> Se ha enviado un correo de verificación</p>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'CREAR OTRO',
        cancelButtonText: 'IR AL PANEL',
        allowOutsideClick: false
    });

    if (result.isConfirmed) {
        // Recargar página para nuevo registro
        location.reload();
    } else {
        window.location.href = '../usuarios/usuarios.html';
    }
}

function manejarErrorRegistro(error) {
    let errorMessage = 'Ocurrió un error al crear el colaborador';
    let errorTitle = 'Error al crear colaborador';

    // Manejar errores específicos
    if (error.code) {
        switch (error.code) {
            case 'auth/email-already-in-use':
                errorMessage = 'Este correo electrónico ya está registrado en el sistema.';
                errorTitle = 'Email en uso';
                break;
            case 'auth/invalid-email':
                errorMessage = 'El correo electrónico no es válido.';
                errorTitle = 'Email inválido';
                break;
            case 'auth/operation-not-allowed':
                errorMessage = 'El registro por correo/contraseña no está habilitado. Contacta al administrador.';
                errorTitle = 'Registro deshabilitado';
                break;
            case 'auth/weak-password':
                errorMessage = 'La contraseña es demasiado débil. Debe tener al menos 8 caracteres con mayúsculas, minúsculas, números y caracteres especiales.';
                errorTitle = 'Contraseña débil';
                break;
            case 'auth/network-request-failed':
                errorMessage = 'Error de conexión a internet. Verifica tu conexión e intenta nuevamente.';
                errorTitle = 'Error de conexión';
                break;
            default:
                if (error.message && error.message.includes('Firestore')) {
                    errorMessage = 'Error en la base de datos';
                    errorTitle = 'Error de base de datos';
                }
        }
    } else if (error.message) {
        errorMessage = error.message;
    }

    Swal.fire({
        icon: 'error',
        title: errorTitle,
        html: `
            <div>
                <p>${errorMessage}</p>
                <p style="color: var(--color-warning, #ff9800); margin-top: 15px; font-size: 0.9rem;">
                    <i class="fas fa-exclamation-triangle"></i> Si el problema persiste, contacta al soporte técnico.
                </p>
            </div>
        `,
        confirmButtonText: 'ENTENDIDO',
        allowOutsideClick: true
    });
}

// ========== FUNCIONES AUXILIARES ==========

function cancelarRegistro() {
    Swal.fire({
        title: '¿Cancelar registro?',
        text: "Se perderán todos los datos ingresados",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'CONFIRMAR',
        cancelButtonText: 'CANCELAR'
    }).then((result) => {
        if (result.isConfirmed) {
            window.location.href = '../usuarios/usuarios.html';
        }
    });
}

function mostrarErrorSistema(mensaje) {
    Swal.fire({
        icon: 'error',
        title: 'Error del sistema',
        text: mensaje || 'Ocurrió un error al cargar el formulario. Por favor, recarga la página.',
        confirmButtonText: 'RECARGAR'
    }).then(() => {
        window.location.reload();
    });
}

// ========== EXPORT ==========
export { initCollaboratorForm };