// ARCHIVO JS PARA CREAR COLABORADOR - VERSIÓN CON CÓDIGO DE COLABORADOR
// CON REGISTRO DE BITÁCORA Y CAMPO TELÉFONO NUMÉRICO
// CON SUCURSALES - SOLO SI EL ÁREA ES "SUCURSALES"
// ROL ELIMINADO - AHORA SE USA UN ROL POR DEFECTO "colaborador"
// CÓDIGO DE COLABORADOR - OPCIONAL, AUTO GENERADO, EDITABLE MANUALMENTE
// ==================== IMPORTS CORREGIDOS ====================
import { UserManager } from '/clases/user.js';
import { AreaManager } from '/clases/area.js';

let historialManager = null;
let sucursalManager = null;

// ==================== INICIALIZACIÓN ====================
document.addEventListener('DOMContentLoaded', function () {
    if (typeof Swal === 'undefined') {
        return;
    }

    inicializarManagers().then(() => {
        initCollaboratorForm();
    });
});

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

// ========== FUNCIONES PARA CÓDIGO DE COLABORADOR ==========

/**
 * Genera el siguiente código disponible para una organización
 * Formato: 001, 002, ..., 999
 * Retorna string vacío si no hay códigos disponibles o hay error
 */
async function generarSiguienteCodigoColaborador(organizacionCamelCase) {
    try {
        const userManager = new UserManager();
        const colaboradores = await userManager.getColaboradoresByOrganizacion(organizacionCamelCase, true);
        
        // Extraer solo códigos válidos que no estén vacíos
        const codigosExistentes = colaboradores
            .map(col => col.codigoColaborador)
            .filter(cod => cod && /^\d{3}$/.test(cod))
            .map(cod => parseInt(cod, 10));
        
        if (codigosExistentes.length === 0) {
            return '001';
        }
        
        // Encontrar el número más alto
        const maxCodigo = Math.max(...codigosExistentes);
        let siguiente = maxCodigo + 1;
        
        // Buscar huecos (por si hay códigos faltantes)
        for (let i = 1; i <= maxCodigo; i++) {
            if (!codigosExistentes.includes(i)) {
                siguiente = i;
                break;
            }
        }
        
        // Límite máximo 999
        if (siguiente > 999) {
            return ''; // Retorna vacío si no hay más códigos disponibles
        }
        
        // Formatear a 3 dígitos
        return siguiente.toString().padStart(3, '0');
        
    } catch (error) {
        return '001';
    }
}

/**
 * Valida que el código tenga formato correcto y sea único en la organización
 * Si el código está vacío, retorna válido (es opcional)
 */
async function validarCodigoColaborador(codigo, organizacionCamelCase, idActual = null) {
    // Si está vacío, es válido (campo opcional)
    if (!codigo || codigo.trim() === '') {
        return { valido: true, mensaje: '' };
    }
    
    // Validar formato: 3 dígitos exactos
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
        
        // Verificar si el código ya existe (excluyendo al usuario actual en caso de edición)
        const existe = colaboradores.some(col => 
            col.codigoColaborador === codigo && col.id !== idActual
        );
        
        if (existe) {
            return { valido: false, mensaje: `El código ${codigo} ya está en uso por otro colaborador` };
        }
        
        return { valido: true, mensaje: '' };
        
    } catch (error) {
        return { valido: true, mensaje: '' };
    }
}

/**
 * Configurar autogeneración y validación del código (opcional)
 */
async function configurarCodigoColaborador(elements, organizacionCamelCase) {
    if (!elements.codigoColaborador) return;
    
    // Generar código automáticamente (solo si está vacío)
    if (!elements.codigoColaborador.value) {
        const codigoGenerado = await generarSiguienteCodigoColaborador(organizacionCamelCase);
        elements.codigoColaborador.value = codigoGenerado;
    }
    
    // Validación en tiempo real
    elements.codigoColaborador.addEventListener('input', async function(e) {
        // Limitar a solo números
        this.value = this.value.replace(/[^0-9]/g, '').slice(0, 3);
        
        // Si está vacío, resetear estilos
        if (this.value.length === 0) {
            this.style.borderColor = '';
            const hint = this.closest('.form-field-group')?.querySelector('.field-hint');
            if (hint) {
                hint.style.color = '';
                hint.innerHTML = `<i class="fas fa-info-circle"></i> Código de 3 dígitos (001-999). Se genera automáticamente, puedes modificarlo o dejarlo vacío.`;
            }
            return;
        }
        
        // Validar formato solo si tiene contenido
        if (this.value.length === 3) {
            const validacion = await validarCodigoColaborador(this.value, organizacionCamelCase);
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
    
    // Evento blur para validar al salir del campo
    elements.codigoColaborador.addEventListener('blur', async function() {
        if (this.value.length > 0 && this.value.length !== 3) {
            this.value = '';
            this.style.borderColor = '';
            const hint = this.closest('.form-field-group')?.querySelector('.field-hint');
            if (hint) {
                hint.style.color = '';
                hint.innerHTML = `<i class="fas fa-info-circle"></i> Código de 3 dígitos (001-999). Se genera automáticamente, puedes modificarlo o dejarlo vacío.`;
            }
        }
    });
}

// ========== FUNCIÓN PARA FILTRAR SOLO NÚMEROS ==========
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
            const key = e.key;
            if (e.ctrlKey || e.altKey || e.metaKey) return;
            if (key === 'Backspace' || key === 'Delete' || key === 'Tab' || key === 'ArrowLeft' || key === 'ArrowRight') return;
            if (!/^[0-9]$/.test(key)) {
                e.preventDefault();
            }
        });
    }
}

async function initCollaboratorForm() {
    const elements = obtenerElementosDOM();
    if (!elements) return;

    configurarFiltroNumerico(elements);

    const userManager = new UserManager();

    try {
        let usuarioActual = obtenerUsuarioActual();

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

        actualizarInterfazConUsuario(elements, usuarioActual);

        // Configurar código de colaborador (opcional, autogenerado)
        await configurarCodigoColaborador(elements, usuarioActual.organizacionCamelCase);

        await cargarAreas(elements, usuarioActual);
        configurarHandlers(elements, userManager, usuarioActual);

    } catch (error) {
        mostrarErrorSistema(error.message);
    }
}

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
                colaboradorCodigo: colaboradorData.codigoColaborador || 'Sin código',
                colaboradorRol: 'colaborador',
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
    try {
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
            codigoColaborador: document.getElementById('codigoColaborador'),
            nombreCompleto: document.getElementById('nombreCompleto'),
            correoElectronico: document.getElementById('correoElectronico'),
            telefono: document.getElementById('telefono'),
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
    if (elements.organization) {
        elements.organization.value = usuario.organizacion;
        elements.organization.classList.add('readonly-field');
    }

    if (elements.adminNameSubtitle) {
        elements.adminNameSubtitle.textContent = `Usuario: ${usuario.nombreCompleto} | ${usuario.organizacion}`;
    }

    if (usuario.fotoOrganizacion && elements.orgCircle && elements.orgPlaceholder && elements.orgImage) {
        try {
            elements.orgPlaceholder.style.display = 'none';
            elements.orgImage.src = usuario.fotoOrganizacion;
            elements.orgImage.style.display = 'block';
            elements.orgCircle.classList.add('org-disabled');
            if (elements.editOrgOverlay) {
                elements.editOrgOverlay.style.display = 'none';
            }
            if (elements.orgInfoText) {
                elements.orgInfoText.textContent = 'Logo heredado. Los colaboradores verán este logo.';
            }
        } catch (error) {
            // Error handling without console
        }
    }

    if (elements.formMainTitle) {
        elements.formMainTitle.textContent = `CREAR COLABORADOR PARA ${usuario.organizacion.toUpperCase()}`;
    }

    if (elements.formSubTitle) {
        elements.formSubTitle.textContent = `Completa los datos para crear un colaborador en ${usuario.organizacion}`;
    }

    mostrarMensajeInfoUsuario(elements.mainMessage, usuario);
}

function mostrarMensajeInfoUsuario(element, usuario) {
    if (!element) return;

    element.innerHTML = `
        <div class="message-container info" style="display: block;">
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.85rem;">
                <div><strong>Creado por:</strong> ${usuario.nombreCompleto}</div>
                <div><strong>Organización:</strong> ${usuario.organizacion}</div>
            </div>
            <div style="margin-top: 8px; padding: 8px; border-radius: 4px; font-size: 0.8rem;">
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
        
        // ✅ FILTRAR: Solo áreas ACTIVAS (estado === 'activa')
        const areasActivas = areas.filter(area => area.estado === 'activa');

        elements.areaSelect._areasData = areas;

        if (areasActivas.length === 0) {
            elements.areaSelect.innerHTML = '<option value="">No hay áreas activas disponibles</option>';
            elements.areaSelect.disabled = false;
            return;
        }

        let options = '<option value="">Selecciona un área</option>';
        areasActivas.forEach(area => {
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

    // Obtener todos los cargos del área
    const todosLosCargos = areaSeleccionada.getCargosAsArray ? areaSeleccionada.getCargosAsArray() : [];
    
    // ✅ FILTRAR: Solo cargos ACTIVOS (estado === 'activo')
    const cargosActivos = todosLosCargos.filter(cargo => cargo.estado === 'activo');

    if (cargosActivos.length === 0) {
        elements.cargoEnAreaSelect.innerHTML = '<option value="">Esta área no tiene cargos activos</option>';
    } else {
        let options = '<option value="">Selecciona un cargo</option>';
        cargosActivos.forEach((cargo, index) => {
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

    if (areaNombre.toLowerCase() === 'sucursales' || areaNombre.toLowerCase() === 'sucursal') {
        cargarSucursales(elements);
    }
}

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

        if (elements.sucursalContainer) {
            elements.sucursalContainer.style.display = 'block';
        }

        elements.sucursalSelect._sucursalesData = sucursales;

    } catch (error) {
        elements.sucursalSelect.innerHTML = '<option value="">Error al cargar sucursales</option>';
        if (elements.sucursalHint) {
            elements.sucursalHint.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error al cargar sucursales';
        }
    }
}

async function verificarLimiteSucursal(sucursalId, organizacionCamelCase) {
    if (!sucursalId || !sucursalManager) return true;

    try {
        const { UserManager } = await import('/clases/user.js');
        const userManager = new UserManager();

        const colaboradores = await userManager.getColaboradoresByOrganizacion(organizacionCamelCase, true);

        const colaboradoresEnSucursal = colaboradores.filter(colab =>
            colab.sucursalAsignadaId === sucursalId
        );

        if (colaboradoresEnSucursal.length >= 2) {
            return false;
        }

        return true;

    } catch (error) {
        return true;
    }
}

// ========== MANEJO DE IMÁGENES CON SWEETALERT2 ==========

function configurarHandlers(elements, userManager, usuario) {
    if (elements.editProfileOverlay && elements.profileInput) {
        elements.editProfileOverlay.addEventListener('click', () => elements.profileInput.click());
        elements.profileCircle.addEventListener('click', () => elements.profileInput.click());

        elements.profileInput.addEventListener('click', function (e) {
            e.stopPropagation();
            this.value = '';
        });

        elements.profileInput.removeEventListener('change', manejarCambioFoto);
        elements.profileInput.addEventListener('change', function (e) {
            manejarCambioFoto(e, elements);
        });
    }

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

    if (elements.areaSelect) {
        elements.areaSelect.addEventListener('change', () => cargarCargosPorArea(elements));
    }

    configurarValidacionTiempoReal(elements);

    if (elements.registerBtn) {
        elements.registerBtn.addEventListener('click', (e) => registrarColaborador(e, elements, userManager, usuario));
    }

    if (elements.cancelBtn) {
        elements.cancelBtn.addEventListener('click', () => cancelarRegistro());
    }
}

let procesandoFoto = false;

function manejarCambioFoto(event, elements) {
    if (procesandoFoto) return;

    const file = event.target.files[0];
    if (!file) return;

    procesandoFoto = true;

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
            elements.profileInput.value = '';
            procesandoFoto = false;
        }).catch(() => {
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
    if (elements.telefono) {
        elements.telefono.addEventListener('input', function () {
            if (this.value) {
                const isValid = /^[0-9]{8,15}$/.test(this.value);
                this.style.borderColor = isValid ? 'var(--color-success, #28a745)' : 'var(--color-danger, #dc3545)';
            } else {
                this.style.borderColor = '';
            }
        });
    }

    if (elements.confirmarContrasena) {
        elements.confirmarContrasena.addEventListener('input', function () {
            if (elements.contrasena.value && this.value) {
                this.style.borderColor = elements.contrasena.value === this.value ? 'var(--color-success, #28a745)' : 'var(--color-danger, #dc3545)';
            } else {
                this.style.borderColor = '';
            }
        });
    }

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

    // Código del colaborador (opcional - solo validar si tiene valor)
    if (elements.codigoColaborador.value.trim()) {
        if (!/^\d{3}$/.test(elements.codigoColaborador.value.trim())) {
            errores.push('El código debe tener exactamente 3 dígitos (001-999)');
        }
    }

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

    // Teléfono
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

    // Validar unicidad del código SOLO si se ingresó un valor
    if (elements.codigoColaborador.value.trim()) {
        const codigoValidacion = await validarCodigoColaborador(
            elements.codigoColaborador.value.trim(),
            usuario.organizacionCamelCase
        );
        if (!codigoValidacion.valido) {
            Swal.fire({
                icon: 'error',
                title: 'Código inválido',
                text: codigoValidacion.mensaje,
                confirmButtonText: 'CORREGIR'
            });
            return;
        }
    }

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

    let confirmHtml = `
        <div style="text-align: left; padding: 10px 0;">
            <p><strong>Código:</strong> ${elements.codigoColaborador.value.trim() || '(Sin código)'}</p>
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
            codigoColaborador: elements.codigoColaborador.value.trim() || '',
            nombreCompleto: elements.nombreCompleto.value.trim(),
            correoElectronico: elements.correoElectronico.value.trim(),
            telefono: elements.telefono?.value.trim() || '',
            fotoUsuario: elements.profileImage.src || null,

            organizacion: usuario.organizacion,
            organizacionCamelCase: usuario.organizacionCamelCase,
            fotoOrganizacion: usuario.fotoOrganizacion,
            theme: usuario.theme || 'light',
            plan: usuario.plan || 'gratis',

            cargo: cargoObjeto,
            areaAsignadaId: areaId,

            sucursalAsignadaId: sucursalId,
            sucursalAsignadaNombre: sucursalNombre,
            sucursalAsignadaCiudad: sucursalCiudad,

            rol: 'colaborador',
            status: true,

            creadoPor: usuario.id,
            creadoPorEmail: usuario.correoElectronico,
            creadoPorNombre: usuario.nombreCompleto,
            fechaCreacion: new Date(),

            permisosPersonalizados: {
                dashboard: true,
                verPerfil: true,
                verOrganizacion: true,
                actualizarPerfil: false,
                crearContenido: false
            }
        };

        const resultado = await userManager.createColaborador(
            colaboradorData,
            elements.contrasena.value,
            usuario.id
        );

        if (resultado && resultado.id) {
            colaboradorData.id = resultado.id;
            await registrarCreacionColaborador(colaboradorData, usuario);
        }

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
                <p><strong>Código:</strong> ${colaboradorData.codigoColaborador || '(Sin código)'}</p>
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
        location.reload();
    } else {
        window.location.href = '../usuarios/usuarios.html';
    }
}

function manejarErrorRegistro(error) {
    let errorMessage = 'Ocurrió un error al crear el colaborador';
    let errorTitle = 'Error al crear colaborador';

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