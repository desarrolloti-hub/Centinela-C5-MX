// crearPermiso.js - VERSIÓN CON MÓDULOS COMPLETOS
// Módulos: Áreas, Categorías, Sucursales, Regiones, Incidencias, Mapa Alertas, Usuarios, Estadísticas, Tareas, Permisos, Login/Monitoreo

// =============================================
// CLASE PRINCIPAL - CrearPermisoController
// =============================================
class CrearPermisoController {
    constructor() {
        this.permisoManager = null;
        this.areaManager = null;
        this.planManager = null;
        this.usuarioActual = null;
        this.permisosPlan = null;

        // Cache de áreas y cargos
        this.areas = [];

        // Inicializar
        this._init();
    }

    // ========== INICIALIZACIÓN ==========
    async _init() {
        try {
            // 1. Cargar usuario desde localStorage
            const usuarioCargado = this._cargarUsuario();

            if (!usuarioCargado) {
                this._redirigirAlLogin();
                return;
            }

            // 2. Cargar managers
            await this._cargarManagers();

            // 3. Cargar permisos del plan (para saber si mostrar Incidencias y Mapa de Alertas)
            await this._cargarPermisosDelPlan();

            // 4. Cargar áreas
            await this._cargarAreas();

            // 5. Configurar eventos
            this._configurarEventos();

            // 6. Configurar organización automática
            this._configurarOrganizacion();

            // 7. Mostrar/ocultar módulos dinámicos según el plan
            this._mostrarModulosDinamicos();

        } catch (error) {
            this._mostrarError('Error al inicializar: ' + error.message);
        }
    }

    // ========== CARGA DE USUARIO ==========
    _cargarUsuario() {
        try {
            const adminInfo = localStorage.getItem('adminInfo');
            if (adminInfo) {
                const adminData = JSON.parse(adminInfo);
                this.usuarioActual = {
                    id: adminData.id || adminData.uid || `admin_${Date.now()}`,
                    uid: adminData.uid || adminData.id,
                    nombreCompleto: adminData.nombreCompleto || 'Administrador',
                    organizacion: adminData.organizacion || 'Sin organización',
                    organizacionCamelCase: adminData.organizacionCamelCase ||
                        this._generarCamelCase(adminData.organizacion),
                    plan: adminData.plan || null,
                    correo: adminData.correoElectronico || adminData.correo || ''
                };
                return true;
            }

            const userData = JSON.parse(localStorage.getItem('userData') || '{}');
            if (userData && Object.keys(userData).length > 0) {
                this.usuarioActual = {
                    id: userData.id || userData.uid || `user_${Date.now()}`,
                    uid: userData.uid || userData.id,
                    nombreCompleto: userData.nombreCompleto || userData.nombre || 'Administrador',
                    organizacion: userData.organizacion || userData.empresa || 'Sin organización',
                    organizacionCamelCase: userData.organizacionCamelCase ||
                        this._generarCamelCase(userData.organizacion || userData.empresa),
                    plan: userData.plan || null,
                    correo: userData.correoElectronico || userData.correo || userData.email || ''
                };
                return true;
            }

            return false;

        } catch (error) {
            return false;
        }
    }

    _generarCamelCase(texto) {
        if (!texto || typeof texto !== 'string') return 'sinOrganizacion';
        return texto
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9]+(.)/g, (match, chr) => chr.toUpperCase())
            .replace(/[^a-zA-Z0-9]/g, '');
    }

    // ========== CARGA DE DEPENDENCIAS ==========
    async _cargarManagers() {
        try {
            const { PermisoManager } = await import('/clases/permiso.js');
            const { AreaManager } = await import('/clases/area.js');
            const { PlanPersonalizadoManager } = await import('/clases/plan.js');

            this.permisoManager = new PermisoManager();
            this.areaManager = new AreaManager();
            this.planManager = new PlanPersonalizadoManager();

            if (this.usuarioActual?.organizacionCamelCase) {
                this.permisoManager.organizacionCamelCase = this.usuarioActual.organizacionCamelCase;
            }

        } catch (error) {
            throw new Error('No se pudieron cargar los módulos necesarios. Verifica la consola.');
        }
    }

    // ========== CARGAR PERMISOS DEL PLAN (PARA INCIDENCIAS Y MAPA DE ALERTAS) ==========
    async _cargarPermisosDelPlan() {
        try {
            let planId = this.usuarioActual?.plan;

            if (!planId) {
                const adminInfo = localStorage.getItem('adminInfo');
                if (adminInfo) {
                    const adminData = JSON.parse(adminInfo);
                    planId = adminData.plan;
                }
            }

            if (!planId) {
                const userData = JSON.parse(localStorage.getItem('userData') || '{}');
                planId = userData.plan;
            }

            if (!planId || planId === 'sin-plan' || planId === 'gratis' || planId === 'null' || planId === 'undefined') {
                this.permisosPlan = { incidencias: false, monitoreo: false };
                return;
            }

            const plan = await this.planManager.obtenerPorId(planId);

            if (!plan) {
                this.permisosPlan = { incidencias: false, monitoreo: false };
                return;
            }

            const mapasActivos = plan.mapasActivos || {};

            this.permisosPlan = {
                incidencias: mapasActivos.incidencias === true,
                monitoreo: mapasActivos.alertas === true
            };

        } catch (error) {
            this.permisosPlan = { incidencias: false, monitoreo: false };
        }
    }

    // ========== MOSTRAR/OCULTAR MÓDULOS DINÁMICOS ==========
    _mostrarModulosDinamicos() {
        // Módulo de Incidencias
        const moduloIncidencias = document.getElementById('permisoIncidenciasCard');
        if (moduloIncidencias) {
            if (this.permisosPlan.incidencias === true) {
                moduloIncidencias.style.display = 'flex';
            } else {
                moduloIncidencias.style.display = 'none';
            }
        }

        // Módulo de Mapa de Alertas
        const moduloMonitoreo = document.getElementById('permisoMonitoreoCard');
        if (moduloMonitoreo) {
            if (this.permisosPlan.monitoreo === true) {
                moduloMonitoreo.style.display = 'flex';
            } else {
                moduloMonitoreo.style.display = 'none';
            }
        }
    }

    // ========== CARGA DE ÁREAS ==========
    async _cargarAreas() {
        try {
            const areaSelect = document.getElementById('areaSelect');
            if (areaSelect) {
                areaSelect.innerHTML = '<option value="" disabled selected>-- Cargando áreas... --</option>';
            }

            if (!this.usuarioActual?.organizacionCamelCase) {
                this.usuarioActual.organizacionCamelCase = 'miOrganizacion';
            }

            this.areas = await this.areaManager.getAreasByOrganizacion(
                this.usuarioActual.organizacionCamelCase
            );

            this._llenarSelectAreas();

        } catch (error) {
            const areaSelect = document.getElementById('areaSelect');
            if (areaSelect) {
                areaSelect.innerHTML = '<option value="" disabled selected>-- Error cargando áreas --</option>';
            }
        }
    }

    _llenarSelectAreas() {
        const areaSelect = document.getElementById('areaSelect');
        if (!areaSelect) return;

        if (!this.areas || this.areas.length === 0) {
            areaSelect.innerHTML = '<option value="" disabled selected>-- No hay áreas disponibles --</option>';
            return;
        }

        areaSelect.innerHTML = '<option value="" disabled selected>-- Selecciona un área --</option>';

        this.areas.forEach(area => {
            const option = document.createElement('option');
            option.value = area.id;
            option.textContent = area.nombreArea;
            areaSelect.appendChild(option);
        });
    }

    // ========== CARGA DE CARGOS POR ÁREA ==========
    _cargarCargosPorArea(areaId) {
        const cargoSelect = document.getElementById('cargoSelect');
        if (!cargoSelect) return;

        cargoSelect.innerHTML = '';
        cargoSelect.disabled = true;

        if (!areaId) {
            cargoSelect.innerHTML = '<option value="" disabled selected>-- Primero selecciona un área --</option>';
            return;
        }

        const area = this.areas.find(a => a.id === areaId);
        if (!area) {
            cargoSelect.innerHTML = '<option value="" disabled selected>-- Área no encontrada --</option>';
            return;
        }

        const cargos = area.getCargosAsArray ? area.getCargosAsArray() : [];

        if (!cargos || cargos.length === 0) {
            cargoSelect.innerHTML = '<option value="" disabled selected>-- No hay cargos en esta área --</option>';
            return;
        }

        cargoSelect.innerHTML = '<option value="" disabled selected>-- Selecciona un cargo --</option>';

        cargos.forEach(cargo => {
            const option = document.createElement('option');
            option.value = cargo.id;
            option.textContent = cargo.nombre;
            cargoSelect.appendChild(option);
        });

        cargoSelect.disabled = false;
    }

    // ========== CONFIGURACIÓN DE ORGANIZACIÓN ==========
    _configurarOrganizacion() {
        const orgInput = document.getElementById('organization');
        if (orgInput && this.usuarioActual) {
            orgInput.value = this.usuarioActual.organizacion || 'Sin organización';
        }
    }

    // ========== CONFIGURACIÓN DE EVENTOS ==========
    _configurarEventos() {
        try {
            const btnVolverLista = document.getElementById('btnVolverLista');
            if (btnVolverLista) {
                btnVolverLista.addEventListener('click', () => this._volverALista());
            }

            const btnCancelar = document.getElementById('cancelBtn');
            if (btnCancelar) {
                btnCancelar.addEventListener('click', () => this._cancelarCreacion());
            }

            const btnCrearPermiso = document.getElementById('registerBtn');
            if (btnCrearPermiso) {
                btnCrearPermiso.addEventListener('click', (e) => {
                    e.preventDefault();
                    this._validarYGuardar();
                });
            }

            const form = document.getElementById('formPermisoPrincipal');
            if (form) {
                form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this._validarYGuardar();
                });
            }

            const areaSelect = document.getElementById('areaSelect');
            if (areaSelect) {
                areaSelect.addEventListener('change', (e) => {
                    const areaId = e.target.value;
                    this._cargarCargosPorArea(areaId);
                });
            }

            this._configurarCheckboxesPermisos();
            this._configurarAccionesRapidas();

        } catch (error) {
            // Error handling without console
        }
    }

    _configurarCheckboxesPermisos() {
        // TODOS los módulos disponibles (incluyendo Permisos y Login/Monitoreo)
        const todosModulos = [
            'Areas', 'Categorias', 'Sucursales', 'Regiones', 
            'Incidencias', 'Monitoreo', 'Usuarios', 'Estadisticas', 
            'Tareas', 'Permisos', 'LoginMonitoreo'
        ];

        todosModulos.forEach(modulo => {
            const checkbox = document.getElementById(`permiso${modulo}`);
            const card = document.getElementById(`permiso${modulo}Card`);

            if (checkbox && card) {
                // Eliminar eventos anteriores para evitar duplicados
                const newCard = card.cloneNode(true);
                card.parentNode.replaceChild(newCard, card);

                const newCheckbox = newCard.querySelector(`#permiso${modulo}`);
                const newCardElement = newCard;

                newCardElement.addEventListener('click', (e) => {
                    if (e.target !== newCheckbox) {
                        newCheckbox.checked = !newCheckbox.checked;
                        this._actualizarEstiloCard(newCardElement, newCheckbox.checked);
                    }
                });

                newCheckbox.addEventListener('change', (e) => {
                    this._actualizarEstiloCard(newCardElement, e.target.checked);
                });

                this._actualizarEstiloCard(newCardElement, newCheckbox.checked);
            }
        });
    }

    _actualizarEstiloCard(card, activo) {
        if (activo) {
            card.classList.add('activo');
        } else {
            card.classList.remove('activo');
        }
    }

    _configurarAccionesRapidas() {
        const btnSeleccionarTodos = document.getElementById('seleccionarTodos');
        if (btnSeleccionarTodos) {
            btnSeleccionarTodos.addEventListener('click', () => {
                const checkboxes = document.querySelectorAll('.permiso-checkbox');
                checkboxes.forEach(checkbox => {
                    checkbox.checked = true;
                    const card = checkbox.closest('.permiso-card');
                    if (card) this._actualizarEstiloCard(card, true);
                });
            });
        }

        const btnDeseleccionarTodos = document.getElementById('deseleccionarTodos');
        if (btnDeseleccionarTodos) {
            btnDeseleccionarTodos.addEventListener('click', () => {
                const checkboxes = document.querySelectorAll('.permiso-checkbox');
                checkboxes.forEach(checkbox => {
                    checkbox.checked = false;
                    const card = checkbox.closest('.permiso-card');
                    if (card) this._actualizarEstiloCard(card, false);
                });
            });
        }
    }

    // ========== OBTENER PERMISOS SELECCIONADOS ==========
    _obtenerPermisosSeleccionados() {
        const permisos = {
            areas: document.getElementById('permisoAreas')?.checked || false,
            categorias: document.getElementById('permisoCategorias')?.checked || false,
            sucursales: document.getElementById('permisoSucursales')?.checked || false,
            regiones: document.getElementById('permisoRegiones')?.checked || false,
            incidencias: document.getElementById('permisoIncidencias')?.checked || false,
            monitoreo: document.getElementById('permisoMonitoreo')?.checked || false,
            usuarios: document.getElementById('permisoUsuarios')?.checked || false,
            estadisticas: document.getElementById('permisoEstadisticas')?.checked || false,
            tareas: document.getElementById('permisoTareas')?.checked || false,
            permisos: document.getElementById('permisoPermisos')?.checked || false,
            loginMonitoreo: document.getElementById('permisoLoginMonitoreo')?.checked || false
        };

        return permisos;
    }

    // ========== VALIDACIÓN Y GUARDADO ==========
    _validarYGuardar() {
        const areaSelect = document.getElementById('areaSelect');
        const areaId = areaSelect.value;

        if (!areaId) {
            areaSelect.classList.add('is-invalid');
            this._mostrarError('Debes seleccionar un área');
            return;
        }
        areaSelect.classList.remove('is-invalid');

        const cargoSelect = document.getElementById('cargoSelect');
        const cargoId = cargoSelect.value;

        if (!cargoId) {
            cargoSelect.classList.add('is-invalid');
            this._mostrarError('Debes seleccionar un cargo');
            return;
        }
        cargoSelect.classList.remove('is-invalid');

        const permisos = this._obtenerPermisosSeleccionados();
        const permisosActivos = Object.values(permisos).filter(v => v === true).length;

        if (permisosActivos === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'Sin permisos seleccionados',
                text: 'No has seleccionado ningún permiso. El cargo no tendrá acceso a ningún módulo en el dashboard.',
                showCancelButton: true,
                confirmButtonText: 'Sí, continuar',
                cancelButtonText: 'Revisar permisos',
                confirmButtonColor: '#2f8cff',
                cancelButtonColor: '#dc3545'
            }).then((result) => {
                if (result.isConfirmed) {
                    this._verificarPermisoExistente(areaId, cargoId, permisos);
                }
            });
            return;
        }

        this._verificarPermisoExistente(areaId, cargoId, permisos);
    }

    async _verificarPermisoExistente(areaId, cargoId, permisos) {
        try {
            const existe = await this.permisoManager.verificarExistente(
                areaId,
                cargoId,
                this.usuarioActual.organizacionCamelCase
            );

            if (existe) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Permiso existente',
                    html: `
                        <p style="color: var(--color-text-secondary);">
                            Ya existe un permiso configurado para esta área y cargo.
                        </p>
                        <p style="color: var(--color-text-dim); font-size: 0.9rem; margin-top: 10px;">
                            Puedes editar el permiso existente o seleccionar otra combinación.
                        </p>
                    `,
                    confirmButtonText: 'Entendido'
                });
                return;
            }

            this._guardarPermiso(areaId, cargoId, permisos);

        } catch (error) {
            this._mostrarError('Error al verificar permiso existente');
        }
    }

    async _guardarPermiso(areaId, cargoId, permisos) {
        const btnCrear = document.getElementById('registerBtn');
        const originalHTML = btnCrear ? btnCrear.innerHTML : '<i class="fas fa-check"></i>Crear Permiso';

        try {
            if (btnCrear) {
                btnCrear.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
                btnCrear.disabled = true;
            }

            if (!this.usuarioActual || !this.usuarioActual.organizacionCamelCase) {
                throw new Error('No hay información de usuario válida');
            }

            const userManager = {
                currentUser: {
                    id: this.usuarioActual.id,
                    uid: this.usuarioActual.uid,
                    organizacionCamelCase: this.usuarioActual.organizacionCamelCase,
                    nombreCompleto: this.usuarioActual.nombreCompleto
                }
            };

            const permisoData = {
                areaId: areaId,
                cargoId: cargoId,
                permisos: permisos,
                organizacionCamelCase: this.usuarioActual.organizacionCamelCase,
                usuarioActual: userManager.currentUser
            };

            const area = this.areas.find(a => a.id === areaId);
            const cargoNombre = this._getCargoNombre(areaId, cargoId);

            await this.permisoManager.crearPermiso(
                permisoData,
                userManager
            );

            const modulosActivos = Object.entries(permisos)
                .filter(([_, valor]) => valor === true)
                .map(([modulo]) => modulo);

            const nombresModulos = {
                areas: 'Áreas',
                categorias: 'Categorías',
                sucursales: 'Sucursales',
                regiones: 'Regiones',
                incidencias: 'Incidencias',
                monitoreo: 'Mapa de Alertas',
                usuarios: 'Usuarios',
                estadisticas: 'Estadísticas',
                tareas: 'Tareas',
                permisos: 'Permisos',
                loginMonitoreo: 'Login/Monitoreo'
            };

            Swal.close();

            await Swal.fire({
                icon: 'success',
                title: '¡Permiso creado!',
                html: `
                    <div style="text-align: left;">
                        <p><strong>Área:</strong> ${area?.nombreArea || 'No especificada'}</p>
                        <p><strong>Cargo:</strong> ${cargoNombre || 'No especificado'}</p>
                        <p><strong>Módulos con acceso:</strong> ${modulosActivos.length}</p>
                        <div style="margin-top: 15px; background: rgba(47,140,255,0.1); padding: 15px; border-radius: 8px;">
                            ${modulosActivos.length > 0 ?
                        modulosActivos.map(modulo =>
                            `<div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                                        <i class="fas fa-check-circle" style="color: #2f8cff;"></i>
                                        <span style="color: var(--color-text-primary);">${nombresModulos[modulo] || modulo}</span>
                                    </div>`
                        ).join('')
                        : '<p style="color: var(--color-text-dim); margin: 0;">Sin módulos asignados</p>'
                    }
                        </div>
                    </div>
                `,
                confirmButtonText: 'Ver permisos'
            });

            this._volverALista();

        } catch (error) {
            Swal.close();

            let mensajeError = error.message || 'No se pudo crear el permiso';

            if (mensajeError.includes('organización')) {
                mensajeError = 'Error con la organización del usuario. Intenta recargar la página.';
            } else if (mensajeError.includes('Ya existe')) {
                mensajeError = error.message;
            } else if (mensajeError.includes('permission')) {
                mensajeError = 'No tienes permisos para realizar esta acción.';
            } else if (mensajeError.includes('network')) {
                mensajeError = 'Error de conexión. Verifica tu internet.';
            }

            this._mostrarError(mensajeError);
        } finally {
            if (btnCrear) {
                btnCrear.innerHTML = originalHTML;
                btnCrear.disabled = false;
            }
        }
    }

    _getCargoNombre(areaId, cargoId) {
        const area = this.areas.find(a => a.id === areaId);
        if (!area || !area.cargos) return null;
        const cargosArray = area.getCargosAsArray();
        const cargo = cargosArray.find(c => c.id === cargoId);
        return cargo?.nombre || null;
    }

    // ========== NAVEGACIÓN ==========
    _volverALista() {
        window.location.href = '../permisos/permisos.html';
    }

    _cancelarCreacion() {
        Swal.fire({
            title: '¿Cancelar?',
            text: 'Los cambios no guardados se perderán',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, cancelar',
            cancelButtonText: 'No, continuar'
        }).then((result) => {
            if (result.isConfirmed) {
                this._volverALista();
            }
        });
    }

    // ========== UTILIDADES ==========
    _mostrarError(mensaje) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: mensaje,
            confirmButtonText: 'Entendido'
        });
    }

    _redirigirAlLogin() {
        window.location.href = '/usuarios/visitantes/inicioSesion/inicioSesion.html';
    }
}

// =============================================
// INICIALIZACIÓN
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    new CrearPermisoController();
});