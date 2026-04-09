// ==================== VARIABLES GLOBALES ====================
let selectedFile = null;
let currentPhotoType = '';

document.addEventListener('DOMContentLoaded', async function () {

    try {
        // Importar los módulos necesarios
        const userModule = await import('/clases/user.js');
        const { UserManager } = userModule;

        // Instanciar UserManager
        const userManager = new UserManager();

        // Esperar a que UserManager cargue el usuario actual
        if (!userManager.currentUser) {
            const waitForUser = setInterval(() => {
                if (userManager.currentUser) {
                    clearInterval(waitForUser);
                    iniciarEditor(userManager);
                }
            }, 500);

            // Timeout después de 5 segundos
            setTimeout(() => {
                if (!userManager.currentUser) {
                    clearInterval(waitForUser);
                    console.error('❌ Timeout esperando usuario');

                    Swal.fire({
                        icon: 'error',
                        title: 'Error de autenticación',
                        text: 'No se pudo cargar el usuario actual',
                        confirmButtonText: 'Ir al login'
                    }).then(() => {
                        window.location.href = '/usuarios/visitantes/inicioSesion/inicioSesion.html';
                    });
                }
            }, 5000);
        } else {
            iniciarEditor(userManager);
        }

    } catch (error) {
        console.error('❌ Error cargando módulos:', error);

        Swal.fire({
            icon: 'error',
            title: 'Error de configuración',
            html: `
                <div style="text-align: left; font-size: 14px;">
                    <p><strong>No se pudo cargar los módulos necesarios</strong></p>
                    <p>Error: ${error.message}</p>
                    <p>Verifica que los archivos existan en las rutas correctas:</p>
                    <ul>
                        <li><code>/clases/user.js</code></li>
                    </ul>
                </div>
            `,
            confirmButtonText: 'Entendido',
            allowOutsideClick: false
        }).then(() => {
            window.location.href = '/usuarios/administrador/panelControl/panelControl.html';
        });
    }
});

// ==================== FUNCIÓN PARA INICIAR EDITOR ====================

async function iniciarEditor(userManager) {

    // Resetear variables globales
    selectedFile = null;
    currentPhotoType = '';

    if (!userManager.currentUser) {
        console.warn('⚠️ Usuario no autenticado según UserManager');

        Swal.fire({
            icon: 'warning',
            title: 'Sesión expirada',
            text: 'Debes iniciar sesión para acceder al editor de perfil',
            timer: 4000,
            showConfirmButton: false
        }).then(() => {
            window.location.href = '/usuarios/visitantes/inicioSesion/inicioSesion.html';
        });
        return;
    }

    // Obtener elementos del DOM
    const elements = getElements();

    try {
        await loadUserData(userManager, elements);
        setupBasicHandlers(elements);
        setupPhotoHandlers(elements, userManager);
        setupSaveHandler(elements, userManager);
        setupPasswordChangeHandler(elements, userManager);
        setupFiltroNumerico(elements); // ✅ Configurar filtro para teléfono
        await setupAreaAndCargoHandlers(elements, userManager);
        
    } catch (error) {
        console.error('❌ Error inicializando editor:', error);
        showMessage(elements.mainMessage, 'error',
            'Error al cargar datos del usuario: ' + error.message);
    }
}

// ========== FUNCIONES DE UTILIDAD ==========

function getElements() {
    return {
        // Fotos
        profileCircle: document.getElementById('profileCircle'),
        profileImage: document.getElementById('profileImage'),
        profilePlaceholder: document.getElementById('profilePlaceholder'),
        editProfileOverlay: document.getElementById('editProfileOverlay'),
        profileInput: document.getElementById('profile-input'),

        orgCircle: document.getElementById('orgCircle'),
        orgImage: document.getElementById('orgImage'),
        orgPlaceholder: document.getElementById('orgPlaceholder'),
        editOrgOverlay: document.getElementById('editOrgOverlay'),
        orgInput: document.getElementById('org-input'),

        // Formulario
        fullName: document.getElementById('fullName'),
        email: document.getElementById('email'),
        telefono: document.getElementById('telefono'), // ✅ Elemento teléfono
        organizationName: document.getElementById('organizationName'),
        position: document.getElementById('position'),

        // Selectores de área y cargo
        areaSelect: document.getElementById('areaSelect'),
        cargoEnAreaSelect: document.getElementById('cargoEnAreaSelect'),

        // Botones y mensajes
        saveChangesBtn: document.getElementById('saveChangesBtn'),
        cancelBtn: document.getElementById('cancelBtn'),
        backToDashboard: document.getElementById('backToDashboard'),
        mainMessage: document.getElementById('mainMessage')
    };
}

// ✅ Filtro solo números para teléfono
function setupFiltroNumerico(elements) {
    if (elements.telefono) {
        // Evento input - filtra cualquier caracter no numérico
        elements.telefono.addEventListener('input', function (e) {
            let originalValue = this.value;
            let filteredValue = originalValue.replace(/[^0-9]/g, '');
            if (filteredValue.length > 15) {
                filteredValue = filteredValue.slice(0, 15);
            }
            if (originalValue !== filteredValue) {
                this.value = filteredValue;
            }
        });

        // Evento paste - solo pega números
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

        // Evento keypress - solo permite teclas numéricas
        elements.telefono.addEventListener('keypress', function (e) {
            if (e.ctrlKey || e.altKey || e.metaKey) return;
            if (e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Tab' || 
                e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || 
                e.key === 'End' || e.key === 'Enter') return;
            if (!/^[0-9]$/.test(e.key)) {
                e.preventDefault();
            }
        });
    }
}

function validateFile(file, type, elements) {
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
        showMessage(elements.mainMessage, 'error',
            `Tipo de archivo no válido. Usa: JPEG, PNG, GIF o WEBP`);
        return false;
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
        showMessage(elements.mainMessage, 'error',
            `La imagen es muy grande (${Math.round(file.size / 1024)}KB). Máximo: 5MB`);
        return false;
    }

    return true;
}

// ========== FUNCIÓN PARA VALIDAR NOMBRE (SOLO LETRAS) ==========

function validarNombreSoloLetras(nombre) {
    // Permite letras, espacios, tildes y letras ñ
    const regex = /^[A-Za-zÁÉÍÓÚáéíóúÑñ\s]+$/;
    return regex.test(nombre);
}

function mostrarErrorNombre(elements) {
    showMessage(elements.mainMessage, 'error',
        'El nombre solo puede contener letras y espacios. No se permiten números ni caracteres especiales.');

    if (elements.fullName) {
        elements.fullName.style.borderColor = '#F44336';
        elements.fullName.style.boxShadow = '0 0 0 2px rgba(244, 67, 54, 0.2)';
        elements.fullName.focus();

        // Remover el estilo después de 3 segundos
        setTimeout(() => {
            elements.fullName.style.borderColor = '';
            elements.fullName.style.boxShadow = '';
        }, 3000);
    }
}

async function loadUserData(userManager, elements) {

    try {
        if (!userManager.currentUser) {
            console.error('❌ No hay usuario actual en UserManager');
            throw new Error('No hay usuario autenticado');
        }

        const user = userManager.currentUser;

        updateUI(elements, user);

    } catch (error) {
        console.error('❌ Error cargando datos:', error);
        throw error;
    }
}

function updateUI(elements, user) {

    if (elements.fullName && user.nombreCompleto) {
        elements.fullName.value = user.nombreCompleto;
    }

    if (elements.email && user.correoElectronico) {
        elements.email.value = user.correoElectronico;
    }

    // ✅ ACTUALIZAR TELÉFONO - SIEMPRE MUESTRA EL CAMPO (aunque esté vacío)
    if (elements.telefono) {
        elements.telefono.value = user.telefono || ''; 
    }

    if (elements.organizationName && user.organizacion) {
        elements.organizationName.value = user.organizacion;
    }
 
    if (elements.position) {
        elements.position.value = user.rol === 'administrador' ? 'Administrador' : 'Usuario';
    }

    // ==================== FOTO DE PERFIL ====================
    if (user.fotoUsuario && user.fotoUsuario.trim() !== '') {
        const profileUrl = user.getFotoUrl ? user.getFotoUrl() : user.fotoUsuario;

        if (elements.profileImage) {
            elements.profileImage.src = profileUrl;
            elements.profileImage.style.display = 'block';

            if (elements.profilePlaceholder) {
                elements.profilePlaceholder.style.display = 'none';
            }

            elements.profileImage.onerror = function () {
                this.style.display = 'none';
                if (elements.profilePlaceholder) {
                    elements.profilePlaceholder.style.display = 'flex';
                }
            };
        }
    } else {
        if (elements.profilePlaceholder) {
            elements.profilePlaceholder.style.display = 'flex';
        }
        if (elements.profileImage) {
            elements.profileImage.style.display = 'none';
        }
    }

    // ==================== LOGO DE ORGANIZACIÓN ====================
    if (user.fotoOrganizacion && user.fotoOrganizacion.trim() !== '') {
        const orgUrl = user.fotoOrganizacion;

        if (elements.orgImage) {
            elements.orgImage.src = orgUrl;
            elements.orgImage.style.display = 'block';

            if (elements.orgPlaceholder) {
                elements.orgPlaceholder.style.display = 'none';
            }

            elements.orgImage.onerror = function () {
                this.style.display = 'none';
                if (elements.orgPlaceholder) {
                    elements.orgPlaceholder.style.display = 'flex';
                }
            };
        }
    } else {
        if (elements.orgPlaceholder) {
            elements.orgPlaceholder.style.display = 'flex';
        }
        if (elements.orgImage) {
            elements.orgImage.style.display = 'none';
        }
    }
}

function showMessage(element, type, text) {
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

    // Auto-ocultar mensajes no críticos
    if (type !== 'error') {
        setTimeout(() => {
            element.style.display = 'none';
        }, 7000);
    }
}

// ========== HANDLERS BÁSICOS ==========

function setupBasicHandlers(elements) {
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
                    window.location.href = '/usuarios/administrador/panelControl/panelControl.html';
                }
            });
        });
    }

    if (elements.backToDashboard) {
        elements.backToDashboard.addEventListener('click', () => {
            window.location.href = '/usuarios/administrador/panelControl/panelControl.html';
        });
    }
}

// ========== HANDLERS DE FOTOS CON SWEETALERT2 ==========

function setupPhotoHandlers(elements, userManager) {
    if (!elements.profileCircle || !elements.orgCircle) return;

    // Variable para controlar que no se procese el mismo archivo múltiples veces
    let procesandoFoto = false;

    // Foto de perfil
    elements.profileCircle.addEventListener('click', () => {
        if (elements.profileInput) {
            elements.profileInput.value = ''; // Limpiar antes de abrir
            elements.profileInput.click();
        }
    });

    if (elements.editProfileOverlay) {
        elements.editProfileOverlay.addEventListener('click', (e) => {
            e.stopPropagation();
            if (elements.profileInput) {
                elements.profileInput.value = ''; // Limpiar antes de abrir
                elements.profileInput.click();
            }
        });
    }

    if (elements.profileInput) {
        elements.profileInput.addEventListener('change', function (e) {
            if (procesandoFoto) return;
            
            const file = e.target.files[0];
            if (!file) return;
            
            procesandoFoto = true;
            
            if (validateFile(file, 'profile', elements)) {
                mostrarModalFotoConSwal(file, 'profile', elements, userManager)
                    .finally(() => {
                        procesandoFoto = false;
                        this.value = ''; // Limpiar después de procesar
                    });
            } else {
                procesandoFoto = false;
                this.value = '';
            }
        });
    }

    // Logo de organización
    elements.orgCircle.addEventListener('click', () => {
        if (elements.orgInput) {
            elements.orgInput.value = ''; // Limpiar antes de abrir
            elements.orgInput.click();
        }
    });

    if (elements.editOrgOverlay) {
        elements.editOrgOverlay.addEventListener('click', (e) => {
            e.stopPropagation();
            if (elements.orgInput) {
                elements.orgInput.value = ''; // Limpiar antes de abrir
                elements.orgInput.click();
            }
        });
    }

    if (elements.orgInput) {
        elements.orgInput.addEventListener('change', function (e) {
            if (procesandoFoto) return;
            
            const file = e.target.files[0];
            if (!file) return;
            
            procesandoFoto = true;
            
            if (validateFile(file, 'organization', elements)) {
                mostrarModalFotoConSwal(file, 'organization', elements, userManager)
                    .finally(() => {
                        procesandoFoto = false;
                        this.value = ''; // Limpiar después de procesar
                    });
            } else {
                procesandoFoto = false;
                this.value = '';
            }
        });
    }
}

async function mostrarModalFotoConSwal(file, type, elements, userManager) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        
        reader.onload = async function(e) {
            const imageBase64 = e.target.result;
            const fileSizeKB = Math.round(file.size / 1024);
            
            const result = await Swal.fire({
                title: type === 'profile' ? 'Confirmar foto de perfil' : 'Confirmar logo de organización',
                html: `
                    <div style="text-align: center;">
                        <img src="${imageBase64}" 
                             style="width: 150px; height: 150px; border-radius: ${type === 'profile' ? '50%' : '8px'}; object-fit: cover; border: 3px solid var(--color-accent-primary); margin: 10px auto 15px auto; display: block;">
                        <p><strong>Tamaño:</strong> ${fileSizeKB} KB</p>
                        <p>¿Deseas usar esta imagen?</p>
                    </div>
                `,
                showCancelButton: true,
                confirmButtonText: 'CONFIRMAR',
                cancelButtonText: 'CANCELAR',
                allowOutsideClick: false
            });
            
            if (result.isConfirmed) {
                await guardarFoto(imageBase64, type, elements, userManager);
            }
            
            resolve();
        };
        
        reader.readAsDataURL(file);
    });
}

async function guardarFoto(imageBase64, type, elements, userManager) {
    Swal.fire({
        title: 'Guardando imagen...',
        text: 'Por favor espera',
        allowOutsideClick: false,
        showConfirmButton: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const currentUser = userManager.currentUser;
        if (!currentUser) {
            throw new Error('No hay usuario autenticado');
        }

        const fieldToUpdate = type === 'profile'
            ? { fotoUsuario: imageBase64 }
            : { fotoOrganizacion: imageBase64 };

        const userType = currentUser.esAdministrador() ? 'administrador' : 'colaborador';

        const success = await userManager.updateUser(
            currentUser.id,
            fieldToUpdate,
            userType,
            currentUser.organizacionCamelCase
        );

        if (success) {
            Swal.close();

            if (type === 'profile') {
                if (elements.profileImage) {
                    elements.profileImage.src = imageBase64;
                    elements.profileImage.style.display = 'block';
                    if (elements.profilePlaceholder) {
                        elements.profilePlaceholder.style.display = 'none';
                    }
                }
                currentUser.fotoUsuario = imageBase64;
            } else {
                if (elements.orgImage) {
                    elements.orgImage.src = imageBase64;
                    elements.orgImage.style.display = 'block';
                    if (elements.orgPlaceholder) {
                        elements.orgPlaceholder.style.display = 'none';
                    }
                }
                currentUser.fotoOrganizacion = imageBase64;
            }

            Swal.fire({
                icon: 'success',
                title: '¡Éxito!',
                text: type === 'profile' 
                    ? 'Foto de perfil actualizada' 
                    : 'Logo de organización actualizado',
                timer: 3000,
                showConfirmButton: false
            });
        } else {
            throw new Error('No se pudo actualizar en la base de datos');
        }
    } catch (error) {
        console.error('❌ Error actualizando imagen:', error);
        Swal.close();

        let errorMessage = 'No se pudo guardar la imagen: ' + error.message;

        if (error.message.includes('permission') || error.message.includes('permiso')) {
            errorMessage = 'No tienes permisos para actualizar la imagen';
        } else if (error.message.includes('network') || error.message.includes('conexión')) {
            errorMessage = 'Error de conexión. Verifica tu internet';
        }

        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: errorMessage,
            confirmButtonText: 'Entendido'
        });
    }
}

// ========== FUNCIONES PARA ÁREA Y CARGO ==========

async function setupAreaAndCargoHandlers(elements, userManager) {
    if (!elements.areaSelect) return;

    const admin = userManager.currentUser;
    if (!admin) return;

    try {
        const { AreaManager } = await import('/clases/area.js');
        const areaManager = new AreaManager();

        elements.areaSelect.innerHTML = '<option value="">Cargando áreas...</option>';
        elements.areaSelect.disabled = true;
        elements.cargoEnAreaSelect.innerHTML = '<option value="">Primero selecciona un área</option>';
        elements.cargoEnAreaSelect.disabled = true;

        const areas = await areaManager.getAreasByOrganizacion(admin.organizacionCamelCase);
        elements.areaSelect._areasData = areas;

        if (areas.length === 0) {
            elements.areaSelect.innerHTML = '<option value="">No hay áreas disponibles</option>';
            elements.areaSelect.disabled = false;
            return;
        }

        let options = '<option value="">Selecciona un área</option>';
        areas.forEach(area => {
            options += `<option value="${area.id}">${area.nombreArea}</option>`;
        });
        elements.areaSelect.innerHTML = options;
        elements.areaSelect.disabled = false;

        elements.areaSelect.addEventListener('change', () => {
            cargarCargosPorArea(elements);
        });

        if (admin.areaAsignadaId) {
            const areaExiste = areas.some(a => a.id === admin.areaAsignadaId);
            if (areaExiste) {
                elements.areaSelect.value = admin.areaAsignadaId;
                const event = new Event('change', { bubbles: true });
                elements.areaSelect.dispatchEvent(event);

                setTimeout(() => {
                    if (admin.cargo && admin.cargo.id && elements.cargoEnAreaSelect) {
                        const option = Array.from(elements.cargoEnAreaSelect.options).find(
                            opt => opt.value === admin.cargo.id
                        );
                        if (option) {
                            elements.cargoEnAreaSelect.value = option.value;
                        } else if (admin.cargo.nombre) {
                            const optionPorNombre = Array.from(elements.cargoEnAreaSelect.options).find(
                                opt => opt.text === admin.cargo.nombre
                            );
                            if (optionPorNombre) {
                                elements.cargoEnAreaSelect.value = optionPorNombre.value;
                            }
                        }
                    }
                }, 300);
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
    const areas = elements.areaSelect._areasData || [];

    elements.cargoEnAreaSelect.innerHTML = '';
    elements.cargoEnAreaSelect.disabled = true;

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
}

// ========== HANDLER DE GUARDADO MODIFICADO (CON TELÉFONO) ==========

function setupSaveHandler(elements, userManager) {
    if (!elements.saveChangesBtn) return;

    elements.saveChangesBtn.addEventListener('click', async () => {
        if (!elements.fullName || !elements.fullName.value.trim()) {
            showMessage(elements.mainMessage, 'error', 'El nombre completo es obligatorio');
            if (elements.fullName) elements.fullName.focus();
            return;
        }

        const nombre = elements.fullName.value.trim();
        if (!validarNombreSoloLetras(nombre)) {
            mostrarErrorNombre(elements);
            return;
        }

        const currentUser = userManager.currentUser;
        if (!currentUser) {
            showMessage(elements.mainMessage, 'error', 'No hay usuario autenticado');
            return;
        }

        Swal.fire({
            title: 'Guardando cambios...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            const updateData = { 
                nombreCompleto: nombre,
                telefono: elements.telefono?.value.trim() || ''  // ✅ Guardar teléfono
            };

            if (elements.areaSelect && elements.areaSelect.value) {
                updateData.areaAsignadaId = elements.areaSelect.value;
            }

            if (elements.cargoEnAreaSelect && elements.cargoEnAreaSelect.value) {
                const cargosData = elements.cargoEnAreaSelect._cargosData || {};
                const cargoSeleccionado = cargosData[elements.cargoEnAreaSelect.value];

                if (cargoSeleccionado) {
                    updateData.cargo = {
                        id: cargoSeleccionado.id || elements.cargoEnAreaSelect.value,
                        nombre: cargoSeleccionado.nombre || 'Cargo sin nombre',
                        descripcion: cargoSeleccionado.descripcion || ''
                    };
                }
            }

            const userType = currentUser.esAdministrador() ? 'administrador' : 'colaborador';

            await userManager.updateUser(
                currentUser.id,
                updateData,
                userType,
                currentUser.organizacionCamelCase
            );

            // Actualizar objeto local
            Object.assign(currentUser, updateData);

            Swal.close();
            Swal.fire({
                icon: 'success',
                title: '¡Éxito!',
                text: 'Datos actualizados correctamente',
                timer: 3000,
                showConfirmButton: false
            });

            showMessage(elements.mainMessage, 'success', 'Cambios guardados exitosamente');

        } catch (error) {
            console.error('❌ Error guardando cambios:', error);
            Swal.close();

            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'No se pudieron guardar los cambios: ' + error.message,
                confirmButtonText: 'Entendido'
            });
        }
    });

    if (elements.fullName) {
        elements.fullName.addEventListener('input', function () {
            const nombre = this.value.trim();
            if (validarNombreSoloLetras(nombre) || nombre === '') {
                this.style.borderColor = '';
                this.style.boxShadow = '';
                if (elements.mainMessage &&
                    elements.mainMessage.textContent.includes('solo puede contener letras')) {
                    elements.mainMessage.style.display = 'none';
                }
            }
        });

        elements.fullName.addEventListener('blur', function () {
            const nombre = this.value.trim();
            if (nombre && !validarNombreSoloLetras(nombre)) {
                mostrarErrorNombre(elements);
            }
        });
    }
}

// ========== FUNCIÓN PARA CAMBIAR CONTRASEÑA ==========



function setupPasswordChangeHandler(elements, userManager) {
    if (!document.getElementById('changePasswordBtn')) {
        const permissionsNote = document.querySelector('.permissions-note');

        if (permissionsNote) {
            const passwordSection = document.createElement('div');
            passwordSection.className = 'password-section-simple';

            const changePasswordBtn = document.createElement('button');
            changePasswordBtn.id = 'changePasswordBtn';
            changePasswordBtn.type = 'button';
            changePasswordBtn.className = 'btn-change-password';
            changePasswordBtn.innerHTML = `
                <i class="fas fa-key"></i> CAMBIAR CONTRASEÑA
            `;

            changePasswordBtn.addEventListener('mouseenter', function () {
                this.style.transform = 'translateY(-2px)';
                this.style.boxShadow = 'var(--shadow-normal)';
            });

            changePasswordBtn.addEventListener('mouseleave', function () {
                this.style.transform = 'translateY(0)';
                this.style.boxShadow = 'var(--shadow-small)';
            });

            const description = document.createElement('p');
            description.className = 'password-change-info';
            description.textContent = 'Se te enviará un enlace seguro a tu correo electrónico para restablecer tu contraseña.';

            changePasswordBtn.addEventListener('click', () => {
                showPasswordResetConfirmation(userManager);
            });

            passwordSection.appendChild(changePasswordBtn);
            passwordSection.appendChild(description);

            permissionsNote.parentNode.insertBefore(passwordSection, permissionsNote.nextSibling);
        }
    }
}

async function showPasswordResetConfirmation(userManager) {
    try {
        const currentUser = userManager.currentUser;
        if (!currentUser || !currentUser.correoElectronico) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'No se pudo obtener el correo electrónico del usuario',
                confirmButtonText: 'ENTENDIDO'
            });
            return;
        }

        const userEmail = currentUser.correoElectronico;

        const result = await Swal.fire({
            title: '¿Cambiar contraseña?',
            html: `
                <div>
                    <p><strong>Correo:</strong> ${userEmail}</p>
                    <p><i class="fas fa-info-circle"></i> El enlace expirará en 1 hora.</p>
                </div>
            `,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'CONFIRMAR',
            cancelButtonText: 'CANCELAR',
            allowOutsideClick: false,
            timer: 6000
        });

        if (result.isConfirmed) {
            Swal.fire({
                title: 'Enviando enlace...',
                text: 'Por favor espera',
                allowOutsideClick: false,
                showConfirmButton: false,
                didOpen: () => Swal.showLoading()
            });

            try {
                // ✅ USAR EL MÉTODO DE UserManager en lugar de conexión directa
                const resultado = await userManager.enviarCorreoRecuperacion(userEmail);

                Swal.close();

                if (resultado.success) {
                    await Swal.fire({
                        icon: 'success',
                        title: '¡Enlace enviado!',
                        html: `
                            <div>
                                <p><strong>Destinatario:</strong> ${userEmail}</p>
                                <p><strong>Válido por:</strong> 1 hora</p>
                                <p>Revisa tu correo (incluyendo spam).</p>
                            </div>
                        `,
                        confirmButtonText: 'ENTENDIDO',
                        allowOutsideClick: false,
                        timer: 5000
                    });
                } else {
                    await Swal.fire({
                        icon: 'error',
                        title: 'Error al enviar',
                        text: resultado.message || 'Ocurrió un error al enviar el correo',
                        confirmButtonText: 'ENTENDIDO'
                    });
                }

            } catch (error) {
                Swal.close();
                console.error('❌ Error enviando correo:', error);

                let errorMessage = 'Ocurrió un error al enviar el correo';

                if (error.code === 'auth/user-not-found') {
                    errorMessage = 'Usuario no encontrado';
                } else if (error.code === 'auth/invalid-email') {
                    errorMessage = 'Correo inválido';
                } else if (error.code === 'auth/too-many-requests') {
                    errorMessage = 'Demasiados intentos';
                } else if (error.code === 'auth/network-request-failed') {
                    errorMessage = 'Error de conexión';
                } else if (error.message) {
                    errorMessage = error.message;
                }

                Swal.fire({
                    icon: 'error',
                    title: errorMessage,
                    text: 'Por favor, intenta nuevamente más tarde.',
                    confirmButtonText: 'ENTENDIDO'
                });
            }
        }

    } catch (error) {
        console.error('Error:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error inesperado',
            text: 'Ocurrió un error inesperado.',
            confirmButtonText: 'ENTENDIDO'
        });
    }
}


