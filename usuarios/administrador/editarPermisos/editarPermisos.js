// editarPermisos.js - EDICIÓN DE PERMISOS
// CON MÓDULOS COMPLETOS (Áreas, Categorías, Sucursales, Regiones, Incidencias, Mapa Alertas, Usuarios, Estadísticas, Tareas, Permisos, Login/Monitoreo)

// =============================================
// CLASE PRINCIPAL - EditarPermisoController
// =============================================
class EditarPermisoController {
    constructor() {
        this.permisoManager = null;
        this.areaManager = null;
        this.planManager = null;
        this.usuarioActual = null;
        this.permisoActual = null;
        this.areas = [];
        this.permisosPlan = null;
        this.permisoId = null;

        // Inicializar
        this._init();
    }

    // ========== INICIALIZACIÓN ==========
    async _init() {
        try {
            // Obtener ID del permiso de la URL
            const urlParams = new URLSearchParams(window.location.search);
            this.permisoId = urlParams.get('id');

            if (!this.permisoId) {
                throw new Error('No se especificó el ID del permiso');
            }

            // 1. Cargar usuario desde localStorage
            const usuarioCargado = this._cargarUsuario();

            if (!usuarioCargado) {
                this._redirigirAlLogin();
                return;
            }

            // 2. Cargar managers
            await this._cargarManagers();

            // 3. Cargar permisos del plan (para saber qué módulos mostrar)
            await this._cargarPermisosDelPlan();

            // 4. Cargar áreas
            await this._cargarAreas();

            // 5. Cargar permiso
            await this._cargarPermiso();

            // 6. Configurar eventos
            this._configurarEventos();

            // 7. Configurar organización automática
            this._configurarOrganizacion();

            // 8. Mostrar/ocultar módulos dinámicos según el plan
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

        // Módulo de Mapa de Alertas (Monitoreo)
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
            if (!this.usuarioActual?.organizacionCamelCase) {
                throw new Error('No hay organización definida');
            }

            this.areas = await this.areaManager.getAreasByOrganizacion(
                this.usuarioActual.organizacionCamelCase
            );

        } catch (error) {
            throw error;
        }
    }

    // ========== CARGA DE PERMISO ==========
    async _cargarPermiso() {
        try {
            // Intentar obtener de localStorage primero (desde la vista de lista)
            const selectedPermiso = localStorage.getItem('selectedPermiso');
            let permisoData = null;

            if (selectedPermiso) {
                permisoData = JSON.parse(selectedPermiso);
                if (permisoData.id === this.permisoId) {
                    this.permisoActual = permisoData;
                }
            }

            // Si no está en localStorage, cargar desde Firebase
            if (!this.permisoActual) {
                this.permisoActual = await this.permisoManager.obtenerPorId(
                    this.permisoId,
                    this.usuarioActual.organizacionCamelCase
                );

                if (!this.permisoActual) {
                    throw new Error('Permiso no encontrado');
                }
            }

            // Cargar datos en el formulario
            this._cargarDatosFormulario();

        } catch (error) {
            throw error;
        }
    }

    // ========== CARGAR DATOS EN FORMULARIO ==========
    _cargarDatosFormulario() {
        if (!this.permisoActual) return;

        // Organización
        document.getElementById('organization').value = this.usuarioActual.organizacion;

        // Área
        const area = this.areas.find(a => a.id === this.permisoActual.areaId);
        document.getElementById('areaNombre').value = area?.nombreArea || this.permisoActual.areaId || 'No especificada';
        document.getElementById('areaId').value = this.permisoActual.areaId;

        // Cargo
        let cargoNombre = this.permisoActual.cargoId;
        if (area && area.cargos && this.permisoActual.cargoId) {
            const cargosArray = area.getCargosAsArray();
            const cargo = cargosArray.find(c => c.id === this.permisoActual.cargoId);
            cargoNombre = cargo?.nombre || this.permisoActual.cargoId;
        }
        document.getElementById('cargoNombre').value = cargoNombre || 'No especificado';
        document.getElementById('cargoId').value = this.permisoActual.cargoId;

        // Permisos
        const permisos = this.permisoActual.permisos || {};

        // Áreas (fijo)
        const chkAreas = document.getElementById('permisoAreas');
        if (chkAreas) {
            chkAreas.checked = permisos.areas || false;
            this._actualizarEstiloCard(document.getElementById('permisoAreasCard'), chkAreas.checked);
        }

        // Categorías (fijo)
        const chkCategorias = document.getElementById('permisoCategorias');
        if (chkCategorias) {
            chkCategorias.checked = permisos.categorias || false;
            this._actualizarEstiloCard(document.getElementById('permisoCategoriasCard'), chkCategorias.checked);
        }

        // Sucursales (fijo)
        const chkSucursales = document.getElementById('permisoSucursales');
        if (chkSucursales) {
            chkSucursales.checked = permisos.sucursales || false;
            this._actualizarEstiloCard(document.getElementById('permisoSucursalesCard'), chkSucursales.checked);
        }

        // Regiones (fijo)
        const chkRegiones = document.getElementById('permisoRegiones');
        if (chkRegiones) {
            chkRegiones.checked = permisos.regiones || false;
            this._actualizarEstiloCard(document.getElementById('permisoRegionesCard'), chkRegiones.checked);
        }

        // Incidencias (dinámico)
        const chkIncidencias = document.getElementById('permisoIncidencias');
        if (chkIncidencias) {
            chkIncidencias.checked = permisos.incidencias || false;
            this._actualizarEstiloCard(document.getElementById('permisoIncidenciasCard'), chkIncidencias.checked);
        }

        // Mapa de Alertas (dinámico)
        const chkMonitoreo = document.getElementById('permisoMonitoreo');
        if (chkMonitoreo) {
            chkMonitoreo.checked = permisos.monitoreo || false;
            this._actualizarEstiloCard(document.getElementById('permisoMonitoreoCard'), chkMonitoreo.checked);
        }

        // Módulo: Usuarios
        const chkUsuarios = document.getElementById('permisoUsuarios');
        if (chkUsuarios) {
            chkUsuarios.checked = permisos.usuarios || false;
            this._actualizarEstiloCard(document.getElementById('permisoUsuariosCard'), chkUsuarios.checked);
        }

        // Módulo: Estadísticas
        const chkEstadisticas = document.getElementById('permisoEstadisticas');
        if (chkEstadisticas) {
            chkEstadisticas.checked = permisos.estadisticas || false;
            this._actualizarEstiloCard(document.getElementById('permisoEstadisticasCard'), chkEstadisticas.checked);
        }

        // Módulo: Tareas
        const chkTareas = document.getElementById('permisoTareas');
        if (chkTareas) {
            chkTareas.checked = permisos.tareas || false;
            this._actualizarEstiloCard(document.getElementById('permisoTareasCard'), chkTareas.checked);
        }

        // NUEVO Módulo: Permisos
        const chkPermisos = document.getElementById('permisoPermisos');
        if (chkPermisos) {
            chkPermisos.checked = permisos.permisos || false;
            this._actualizarEstiloCard(document.getElementById('permisoPermisosCard'), chkPermisos.checked);
        }

        // NUEVO Módulo: Login/Monitoreo
        const chkLoginMonitoreo = document.getElementById('permisoLoginMonitoreo');
        if (chkLoginMonitoreo) {
            chkLoginMonitoreo.checked = permisos.loginMonitoreo || false;
            this._actualizarEstiloCard(document.getElementById('permisoLoginMonitoreoCard'), chkLoginMonitoreo.checked);
        }
    }

    // ========== CONFIGURACIÓN DE ORGANIZACIÓN ==========
    _configurarOrganizacion() {
        // Ya se configura en _cargarDatosFormulario
    }

    // ========== CONFIGURACIÓN DE EVENTOS ==========
    _configurarEventos() {
        try {
            // Botón Volver a la lista
            const btnVolverLista = document.getElementById('btnVolverLista');
            if (btnVolverLista) {
                btnVolverLista.addEventListener('click', () => this._volverALista());
            }

            // Botón Cancelar
            const btnCancelar = document.getElementById('cancelBtn');
            if (btnCancelar) {
                btnCancelar.addEventListener('click', () => this._cancelarEdicion());
            }

            // Botón Guardar Cambios
            const btnGuardar = document.getElementById('guardarBtn');
            if (btnGuardar) {
                btnGuardar.addEventListener('click', (e) => {
                    e.preventDefault();
                    this._guardarCambios();
                });
            }

            // Configurar eventos de checkboxes de permisos
            this._configurarCheckboxesPermisos();

            // Configurar botones de acciones rápidas
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
        // Seleccionar todos
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

        // Deseleccionar todos
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

    // ========== GUARDAR CAMBIOS ==========
    async _guardarCambios() {
        const btnGuardar = document.getElementById('guardarBtn');
        const originalHTML = btnGuardar ? btnGuardar.innerHTML : '<i class="fas fa-save"></i>Guardar Cambios';

        try {
            if (btnGuardar) {
                btnGuardar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
                btnGuardar.disabled = true;
            }

            // Validar que tengamos los datos necesarios
            if (!this.usuarioActual || !this.usuarioActual.organizacionCamelCase) {
                throw new Error('No hay información de usuario válida');
            }

            if (!this.permisoActual || !this.permisoActual.id) {
                throw new Error('No hay información del permiso a editar');
            }

            // Obtener permisos seleccionados
            const nuevosPermisos = this._obtenerPermisosSeleccionados();

            // Crear objeto userManager para pasar a la clase
            const userManager = {
                currentUser: {
                    id: this.usuarioActual.id,
                    uid: this.usuarioActual.uid,
                    organizacionCamelCase: this.usuarioActual.organizacionCamelCase,
                    nombreCompleto: this.usuarioActual.nombreCompleto
                }
            };

            // Actualizar permiso usando el manager
            const permisoActualizado = await this.permisoManager.actualizarPermiso(
                this.permisoActual.id,
                nuevosPermisos,
                this.usuarioActual.id || this.usuarioActual.uid,
                this.usuarioActual.organizacionCamelCase,
                userManager.currentUser
            );

            // Limpiar localStorage
            localStorage.removeItem('selectedPermiso');

            // Mostrar éxito
            await Swal.fire({
                icon: 'success',
                title: '¡Permiso actualizado!',
                text: 'Los cambios han sido guardados correctamente.',
                timer: 2000,
                showConfirmButton: false
            });

            this._volverALista();

        } catch (error) {
            let mensajeError = error.message || 'No se pudo actualizar el permiso';

            // Mensajes más amigables
            if (mensajeError.includes('organización')) {
                mensajeError = 'Error con la organización del usuario. Intenta recargar la página.';
            } else if (mensajeError.includes('permission')) {
                mensajeError = 'No tienes permisos para realizar esta acción.';
            } else if (mensajeError.includes('network')) {
                mensajeError = 'Error de conexión. Verifica tu internet.';
            }

            this._mostrarError(mensajeError);
        } finally {
            if (btnGuardar) {
                btnGuardar.innerHTML = originalHTML;
                btnGuardar.disabled = false;
            }
        }
    }

    // ========== NAVEGACIÓN ==========
    _volverALista() {
        // Limpiar localStorage
        localStorage.removeItem('selectedPermiso');
        window.location.href = '../permisos/permisos.html';
    }

    _cancelarEdicion() {
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
    new EditarPermisoController();
});