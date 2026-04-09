// editarAreas.js - VERSIÓN ORIGINAL + BÚSQUEDA DE USUARIOS PARA RESPONSABLE + BORRADO RÁPIDO

window.editarAreaDebug = {
    estado: 'iniciando',
    controller: null
};

let Area, AreaManager;

// Importar Firebase para buscar usuarios
import { db } from '/config/firebase-config.js';
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

// LÍMITES DE CARACTERES
const LIMITES = {
    NOMBRE_AREA: 50,
    DESCRIPCION_AREA: 500,
    NOMBRE_CARGO: 50,
    DESCRIPCION_CARGO: 200
};

async function cargarDependencias() {
    try {
        const areaModule = await import('/clases/area.js');
        Area = areaModule.Area;
        AreaManager = areaModule.AreaManager;

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(iniciarAplicacion, 100);
            });
        } else {
            setTimeout(iniciarAplicacion, 100);
        }

    } catch (error) {
        console.error('[Error]', error.message);
        mostrarErrorInterfaz(error.message);
    }
}

function mostrarErrorInterfaz(mensaje) {
    const container = document.querySelector('.centinela-container') || document.body;
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-carga';
    errorDiv.innerHTML = `
        <h4><i class="fas fa-exclamation-triangle"></i> Error de Carga</h4>
        <p>${mensaje}</p>
    `;
    container.prepend(errorDiv);
}

function iniciarAplicacion() {
    try {
        const app = new EditarAreaController();
        window.editarAreaDebug.controller = app;
        app.init();
    } catch (error) {
        console.error('[Error]', error.message);
        mostrarErrorInterfaz(error.message);
    }
}

class EditarAreaController {
    constructor() {
        const orgData = this._cargarDatosOrganizacion();

        this.areaManager = new AreaManager();

        this.userManager = {
            currentUser: {
                id: orgData.userId || 'usuario_temp',
                nombreCompleto: orgData.nombreUsuario || 'Usuario',
                organizacion: orgData.organizacionNombre,
                organizacionCamelCase: orgData.organizacionCamelCase
            }
        };

        this.areaActual = null;
        this.datosOriginales = null;
        this.cargos = [];
        this.usuariosActivos = [];
        this._inputHandler = null;
        this._submitHandler = null;
    }

    _cargarDatosOrganizacion() {
        try {
            const adminInfo = localStorage.getItem('adminInfo');
            if (adminInfo) {
                const adminData = JSON.parse(adminInfo);
                return {
                    organizacionNombre: adminData.organizacion || 'Mi Organización',
                    organizacionCamelCase: adminData.organizacionCamelCase || this._generarCamelCase(adminData.organizacion),
                    userId: adminData.id,
                    nombreUsuario: adminData.nombreCompleto
                };
            }

            const userData = JSON.parse(localStorage.getItem('userData') || '{}');
            const orgNombre = userData.organizacion || userData.empresa || 'Mi Organización';

            return {
                organizacionNombre: orgNombre,
                organizacionCamelCase: userData.organizacionCamelCase || this._generarCamelCase(orgNombre),
                userId: userData.id,
                nombreUsuario: userData.nombreCompleto || userData.nombre || 'Usuario'
            };

        } catch (error) {
            console.error('Error cargando datos de organización:', error);
            return {
                organizacionNombre: 'Mi Organización',
                organizacionCamelCase: 'miOrganizacion',
                userId: 'usuario_temp',
                nombreUsuario: 'Usuario'
            };
        }
    }

    _generarCamelCase(texto) {
        if (!texto || typeof texto !== 'string') return 'miOrganizacion';
        return texto
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9]+(.)/g, (match, chr) => chr.toUpperCase())
            .replace(/[^a-zA-Z0-9]/g, '');
    }

    _obtenerIniciales(nombre) {
        if (!nombre) return '??';
        const palabras = nombre.trim().split(' ');
        if (palabras.length === 1) return palabras[0].substring(0, 2).toUpperCase();
        return (palabras[0][0] + palabras[palabras.length - 1][0]).toUpperCase();
    }

    _escapeHTML(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // ========== CONFIGURAR BORRADO RÁPIDO ==========
    _configurarBorradoRapido() {
        const responsableInput = document.getElementById('responsableInput');
        if (!responsableInput) return;

        responsableInput.addEventListener('keydown', (e) => {
            if ((e.key === 'Backspace' || e.key === 'Delete') && responsableInput.value.length > 0) {
                responsableInput.value = '';
                document.getElementById('responsableId').value = '';
                document.getElementById('responsableNombre').value = '';
                e.preventDefault();
            }
        });
    }

    // ========== CARGAR USUARIOS ACTIVOS ==========
    async cargarUsuariosActivos() {
        const responsableInput = document.getElementById('responsableInput');
        const sugerenciasContainer = document.getElementById('sugerenciasList');

        if (!responsableInput || !sugerenciasContainer) return;

        try {
            const orgCamelCase = this.userManager.currentUser.organizacionCamelCase;

            const coleccionColaboradores = `colaboradores_${orgCamelCase}`;
            const colaboradoresQuery = query(
                collection(db, coleccionColaboradores),
                where("status", "==", true)
            );
            const colaboradoresSnapshot = await getDocs(colaboradoresQuery);

            const administradoresQuery = query(
                collection(db, "administradores"),
                where("organizacionCamelCase", "==", orgCamelCase),
                where("status", "==", true)
            );
            const administradoresSnapshot = await getDocs(administradoresQuery);

            this.usuariosActivos = [];

            administradoresSnapshot.forEach(doc => {
                const data = doc.data();
                this.usuariosActivos.push({
                    id: doc.id,
                    nombre: data.nombreCompleto,
                    email: data.correoElectronico,
                    rol: 'Administrador'
                });
            });

            colaboradoresSnapshot.forEach(doc => {
                const data = doc.data();
                this.usuariosActivos.push({
                    id: doc.id,
                    nombre: data.nombreCompleto,
                    email: data.correoElectronico,
                    rol: 'Colaborador'
                });
            });

            let timeoutId;
            responsableInput.addEventListener('input', (e) => {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => {
                    this._filtrarSugerencias(e.target.value);
                }, 300);
            });

            document.addEventListener('click', (e) => {
                if (!responsableInput.contains(e.target) && !sugerenciasContainer.contains(e.target)) {
                    sugerenciasContainer.style.display = 'none';
                }
            });

        } catch (error) {
            console.error('Error cargando usuarios:', error);
        }
    }

    _filtrarSugerencias(texto) {
        const sugerenciasContainer = document.getElementById('sugerenciasList');

        if (!texto || texto.trim() === '') {
            sugerenciasContainer.style.display = 'none';
            return;
        }

        const textoLower = texto.toLowerCase().trim();
        const filtrados = this.usuariosActivos.filter(usuario =>
            usuario.nombre.toLowerCase().includes(textoLower) ||
            usuario.email.toLowerCase().includes(textoLower)
        );

        if (filtrados.length === 0) {
            sugerenciasContainer.style.display = 'none';
            return;
        }

        this._mostrarSugerencias(filtrados);
    }

    _mostrarSugerencias(usuarios) {
        const sugerenciasContainer = document.getElementById('sugerenciasList');

        let html = '';
        usuarios.forEach(usuario => {
            const iniciales = this._obtenerIniciales(usuario.nombre);
            html += `
                <div class="sugerencia-item" data-id="${usuario.id}" data-nombre="${this._escapeHTML(usuario.nombre)}" data-rol="${usuario.rol}">
                    <div class="sugerencia-avatar">${iniciales}</div>
                    <div class="sugerencia-info">
                        <div class="sugerencia-nombre">${this._escapeHTML(usuario.nombre)}</div>
                        <div class="sugerencia-email">${this._escapeHTML(usuario.email)}</div>
                    </div>
                    <div class="sugerencia-rol">${usuario.rol}</div>
                </div>
            `;
        });

        sugerenciasContainer.innerHTML = html;
        sugerenciasContainer.style.display = 'block';

        document.querySelectorAll('.sugerencia-item').forEach(item => {
            item.addEventListener('click', () => {
                const userId = item.getAttribute('data-id');
                const userNombre = item.getAttribute('data-nombre');
                const userRol = item.getAttribute('data-rol');

                document.getElementById('responsableInput').value = `${userNombre} (${userRol})`;
                document.getElementById('responsableId').value = userId;
                document.getElementById('responsableNombre').value = userNombre;

                sugerenciasContainer.style.display = 'none';
            });
        });
    }

    async cargarResponsableActual() {
        const responsableInput = document.getElementById('responsableInput');
        const responsableIdHidden = document.getElementById('responsableId');
        const responsableNombreHidden = document.getElementById('responsableNombre');

        if (!responsableInput) return;

        setTimeout(() => {
            if (this.areaActual.responsable && this.areaActual.responsableNombre) {
                const esAdmin = this.areaActual.responsable === this.userManager.currentUser.id;
                const rolTexto = esAdmin ? 'Administrador' : 'Responsable';
                responsableInput.value = `${this.areaActual.responsableNombre} (${rolTexto})`;
                responsableIdHidden.value = this.areaActual.responsable;
                responsableNombreHidden.value = this.areaActual.responsableNombre;
            } else if (this.areaActual.responsable) {
                const usuario = this.usuariosActivos.find(u => u.id === this.areaActual.responsable);
                if (usuario) {
                    responsableInput.value = `${usuario.nombre} (${usuario.rol})`;
                    responsableIdHidden.value = usuario.id;
                    responsableNombreHidden.value = usuario.nombre;
                }
            }
        }, 500);
    }

    init() {
        this.inicializarEventos();
        this.inicializarValidaciones();
        this.cargarUsuariosActivos();
        this.inicializarGestionCargos();
        this.cargarArea();
        this.aplicarLimitesCaracteres();
        this._configurarBorradoRapido();  // ← Agregado: borrado rápido con Backspace/Delete

    }

    aplicarLimitesCaracteres() {
        const nombreArea = document.getElementById('nombreArea');
        if (nombreArea) {
            nombreArea.maxLength = LIMITES.NOMBRE_AREA;
            nombreArea.addEventListener('input', () => this.validarLongitudCampo(nombreArea, LIMITES.NOMBRE_AREA, 'El nombre del área'));
        }

        const descripcionArea = document.getElementById('descripcionArea');
        if (descripcionArea) {
            descripcionArea.maxLength = LIMITES.DESCRIPCION_AREA;
            descripcionArea.addEventListener('input', () => this.validarLongitudCampo(descripcionArea, LIMITES.DESCRIPCION_AREA, 'La descripción'));
        }
    }

    validarLongitudCampo(campo, limite, nombreCampo) {
        const longitud = campo.value.length;
        if (longitud > limite) {
            campo.value = campo.value.substring(0, limite);
            this.mostrarNotificacion(`${nombreCampo} no puede exceder ${limite} caracteres`, 'warning', 3000);
        }
    }

    validarLongitudCargo(nombre, descripcion) {
        if (nombre && nombre.length > LIMITES.NOMBRE_CARGO) {
            this.mostrarNotificacion(`El nombre del cargo no puede exceder ${LIMITES.NOMBRE_CARGO} caracteres`, 'warning', 3000);
            return false;
        }
        if (descripcion && descripcion.length > LIMITES.DESCRIPCION_CARGO) {
            this.mostrarNotificacion(`La descripción del cargo no puede exceder ${LIMITES.DESCRIPCION_CARGO} caracteres`, 'warning', 3000);
            return false;
        }
        return true;
    }

    inicializarEventos() {
        const btnVolverLista = document.getElementById('btnVolverLista');
        if (btnVolverLista) {
            btnVolverLista.addEventListener('click', () => this.volverALista());
        }

        const descripcionArea = document.getElementById('descripcionArea');
        if (descripcionArea) {
            if (this._inputHandler) {
                descripcionArea.removeEventListener('input', this._inputHandler);
            }
            this._inputHandler = () => this.actualizarContadorCaracteres();
            descripcionArea.addEventListener('input', this._inputHandler);
        }

        const btnCancelar = document.getElementById('btnCancelar');
        if (btnCancelar) {
            btnCancelar.addEventListener('click', () => this.cancelarEdicion());
        }

        const btnAgregarCargo = document.getElementById('btnAgregarCargo');
        if (btnAgregarCargo) {
            btnAgregarCargo.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.agregarCargo();
            });
        }

        const formEditarArea = document.getElementById('formEditarArea');
        if (formEditarArea) {
            if (this._submitHandler) {
                formEditarArea.removeEventListener('submit', this._submitHandler);
            }
            this._submitHandler = (e) => {
                e.preventDefault();
                this.validarYPrepararGuardado();
            };
            formEditarArea.addEventListener('submit', this._submitHandler);
        }
    }

    inicializarValidaciones() {
        this.actualizarContadorCaracteres();
    }

    actualizarContadorCaracteres() {
        const descripcionArea = document.getElementById('descripcionArea');
        const contador = document.getElementById('contadorCaracteres');

        if (descripcionArea && contador) {
            const longitud = descripcionArea.value.length;
            contador.textContent = `${longitud}/${LIMITES.DESCRIPCION_AREA}`;

            if (longitud > LIMITES.DESCRIPCION_AREA * 0.9) {
                contador.style.color = 'var(--color-warning)';
            } else if (longitud > LIMITES.DESCRIPCION_AREA * 0.95) {
                contador.style.color = 'var(--color-danger)';
            } else {
                contador.style.color = 'var(--color-accent-primary)';
            }
        }
    }

    async cargarArea() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const areaId = urlParams.get('id');

            if (!areaId) {
                this.mostrarError('No se especificó qué área editar');
                setTimeout(() => this.volverALista(), 2000);
                return;
            }

            const area = await this.areaManager.getAreaById(
                areaId,
                this.userManager.currentUser.organizacionCamelCase
            );

            if (area) {
                this.areaActual = area;
                this.cargarDatosEnFormulario();
                this.datosOriginales = JSON.parse(JSON.stringify(this.obtenerDatosCompletos()));

                document.title = `Editar ${this.areaActual.nombreArea} - Sistema Centinela`;

                const nombreTitulo = document.getElementById('nombreAreaTitulo');
                if (nombreTitulo) {
                    nombreTitulo.textContent = this.areaActual.nombreArea;
                }
            } else {
                this.mostrarError('Área no encontrada');
                setTimeout(() => this.volverALista(), 2000);
            }

        } catch (error) {
            console.error('Error cargando área:', error);
            this.mostrarError('Error cargando área: ' + error.message);
            setTimeout(() => this.volverALista(), 2000);
        }
    }

    cargarDatosEnFormulario() {
        if (!this.areaActual) return;

        document.getElementById('areaId').value = this.areaActual.id;
        document.getElementById('nombreArea').value = this.areaActual.nombreArea || '';
        document.getElementById('descripcionArea').value = this.areaActual.descripcion || '';

        this.cargarResponsableActual();
        this.cargarCargosExistentes();
        this.actualizarContadorCaracteres();
    }

    inicializarGestionCargos() { }

    cargarCargosExistentes() {
        this.cargos = [];

        if (this.areaActual.cargos) {
            if (Array.isArray(this.areaActual.cargos)) {
                this.areaActual.cargos.forEach((cargo, index) => {
                    if (cargo?.nombre) {
                        this.cargos.push({
                            id: cargo.id || `cargo_${index}_${Date.now()}`,
                            nombre: cargo.nombre || '',
                            descripcion: cargo.descripcion || '',
                            estado: cargo.estado || 'activo'
                        });
                    }
                });
            } else if (typeof this.areaActual.cargos === 'object') {
                Object.keys(this.areaActual.cargos).forEach(key => {
                    const cargo = this.areaActual.cargos[key];
                    if (cargo?.nombre) {
                        this.cargos.push({
                            id: key,
                            nombre: cargo.nombre || '',
                            descripcion: cargo.descripcion || '',
                            estado: cargo.estado || 'activo'
                        });
                    }
                });
            }
        }

        this.renderizarCargos();
    }

    agregarCargo() {
        const cargoId = `cargo_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

        const nuevoCargo = {
            id: cargoId,
            nombre: '',
            descripcion: '',
            estado: 'activo'
        };

        this.cargos.push(nuevoCargo);
        this.renderizarCargos();

        setTimeout(() => {
            const input = document.getElementById(`cargo_nombre_${cargoId}`);
            if (input) input.focus();
        }, 100);
    }

    async inactivarCargo(cargoId) {
        const cargo = this.cargos.find(c => c.id === cargoId);
        if (!cargo) return;

        if (cargo.estado === 'inactivo') {
            const result = await Swal.fire({
                title: '¿Reactivar cargo?',
                text: `El cargo "${cargo.nombre || 'Sin nombre'}" está inactivo. ¿Desea reactivarlo?`,
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Sí, reactivar',
                cancelButtonText: 'Cancelar'
            });

            if (result.isConfirmed) {
                cargo.estado = 'activo';
                this.renderizarCargos();
                this.mostrarNotificacion('Cargo reactivado. Recuerde guardar los cambios.', 'success');
            }
            return;
        }

        const result = await Swal.fire({
            title: '¿Inactivar cargo?',
            html: `El cargo <strong>${cargo.nombre || 'Sin nombre'}</strong> quedará inactivo.<br><br>
                   <span style="color: #ffc107;">⚠️ Los empleados con este cargo podrían verse afectados.</span><br>
                   ¿Desea continuar?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, inactivar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6'
        });

        if (result.isConfirmed) {
            cargo.estado = 'inactivo';
            this.renderizarCargos();
            this.mostrarNotificacion('Cargo inactivado. Recuerde guardar los cambios.', 'success');
        }
    }

    renderizarCargos() {
        const cargosList = document.getElementById('cargosList');
        if (!cargosList) return;

        const cargosActivos = this.cargos.filter(c => c.estado === 'activo');
        const cargosInactivos = this.cargos.filter(c => c.estado === 'inactivo');

        if (this.cargos.length === 0) {
            cargosList.innerHTML = `
                <div class="cargos-empty">
                    <i class="fas fa-briefcase mb-2"></i>
                    <p>No hay cargos agregados</p>
                    <small>Haga clic en "Agregar Cargo" para añadir uno</small>
                </div>
            `;
            return;
        }

        let html = '';

        if (cargosActivos.length > 0) {
            html += `<div class="cargos-seccion">
                        <h6 class="seccion-titulo"><i class="fas fa-check-circle text-success"></i> Cargos Activos</h6>`;
            cargosActivos.forEach((cargo, index) => {
                html += this._renderizarCargoItem(cargo, index, false);
            });
            html += `</div>`;
        }

        if (cargosInactivos.length > 0) {
            html += `<div class="cargos-seccion mt-4">
                        <h6 class="seccion-titulo"><i class="fas fa-ban text-danger"></i> Cargos Inactivos</h6>`;
            cargosInactivos.forEach((cargo, index) => {
                html += this._renderizarCargoItem(cargo, index, true);
            });
            html += `</div>`;
        }

        cargosList.innerHTML = html;
    }

    _renderizarCargoItem(cargo, index, esInactivo) {
        const nombreActual = cargo.nombre || '';
        const descripcionActual = cargo.descripcion || '';
        const estadoClass = esInactivo ? 'cargo-item-inactivo' : 'cargo-item';
        const estadoBadge = esInactivo ?
            '<span class="badge-inactivo-cargo"><i class=""></i> Inactivo</span>' :
            '<span class="badge-activo-cargo"><i class=""></i> Activo</span>';

        const botonTexto = esInactivo ? 'Reactivar' : 'Inactivar';
        const botonIcono = esInactivo ? 'fa-undo-alt' : 'fa-ban';
        const botonColor = esInactivo ? 'btn-reactivar' : 'btn-inactivar';

        return `
            <div class="${estadoClass}" id="cargo_${cargo.id}" style="${esInactivo ? 'opacity: 0.85; background: rgba(0,0,0,0.3); border-left: 3px solid #dc3545;' : ''}">
                <div class="cargo-header">
                    <div>
                        <h6 class="cargo-titulo">
                            <i class="fas fa-briefcase me-2"></i>
                            Cargo #${index + 1} ${estadoBadge}
                        </h6>
                    </div>
                    <button type="button" class="${botonColor}" onclick="window.editarAreaDebug.controller.inactivarCargo('${cargo.id}')">
                        <i class="fas ${botonIcono} me-1"></i>
                        ${botonTexto}
                    </button>
                </div>
                <div style="display: flex; flex-wrap: wrap; margin: 0 -10px;">
                    <div style="width: 50%; padding: 0 10px; box-sizing: border-box;">
                        <label class="form-label">Nombre del Cargo *</label>
                        <input type="text" class="form-control" 
                               id="cargo_nombre_${cargo.id}"
                               value="${this.escapeHTML(nombreActual)}"
                               placeholder="Ej: Gerente, Analista, Coordinador"
                               maxlength="${LIMITES.NOMBRE_CARGO}"
                               ${esInactivo ? 'disabled' : ''}
                               oninput="window.editarAreaDebug.controller.actualizarCargo('${cargo.id}', 'nombre', this.value); window.editarAreaDebug.controller.actualizarContadorCargo('${cargo.id}', 'nombre')">
                        <div class="char-limit-info">
                            <span class="char-counter" id="contador_nombre_${cargo.id}">${nombreActual.length}/${LIMITES.NOMBRE_CARGO}</span>
                        </div>
                    </div>
                    <div style="width: 50%; padding: 0 10px; box-sizing: border-box;">
                        <label class="form-label">Descripción del Cargo</label>
                        <input type="text" class="form-control" 
                               id="cargo_descripcion_${cargo.id}"
                               value="${this.escapeHTML(descripcionActual)}"
                               placeholder="Responsabilidades principales"
                               maxlength="${LIMITES.DESCRIPCION_CARGO}"
                               ${esInactivo ? 'disabled' : ''}
                               oninput="window.editarAreaDebug.controller.actualizarCargo('${cargo.id}', 'descripcion', this.value); window.editarAreaDebug.controller.actualizarContadorCargo('${cargo.id}', 'descripcion')">
                        <div class="char-limit-info">
                            <span class="char-counter" id="contador_descripcion_${cargo.id}">${descripcionActual.length}/${LIMITES.DESCRIPCION_CARGO}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    actualizarCargo(cargoId, campo, valor) {
        const cargo = this.cargos.find(c => c.id === cargoId);
        if (cargo && cargo.estado === 'activo') {
            const limite = campo === 'nombre' ? LIMITES.NOMBRE_CARGO : LIMITES.DESCRIPCION_CARGO;

            if (valor.length > limite) {
                valor = valor.substring(0, limite);
                this.mostrarNotificacion(`${campo === 'nombre' ? 'El nombre' : 'La descripción'} no puede exceder ${limite} caracteres`, 'warning', 3000);
            }
            cargo[campo] = valor;
        }
    }

    actualizarContadorCargo(cargoId, campo) {
        const input = document.getElementById(`cargo_${campo}_${cargoId}`);
        const contador = document.getElementById(`contador_${campo}_${cargoId}`);

        if (input && contador) {
            const longitud = input.value.length;
            const limite = campo === 'nombre' ? LIMITES.NOMBRE_CARGO : LIMITES.DESCRIPCION_CARGO;
            contador.textContent = `${longitud}/${limite}`;
        }
    }

    escapeHTML(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    validarFormulario() {
        const nombreArea = document.getElementById('nombreArea')?.value.trim();
        const descripcion = document.getElementById('descripcionArea')?.value.trim();
        const responsableId = document.getElementById('responsableId')?.value;

        if (!nombreArea) {
            this.mostrarError('El nombre del área es requerido');
            return false;
        }

        if (nombreArea.length > LIMITES.NOMBRE_AREA) {
            this.mostrarError(`El nombre del área no puede exceder ${LIMITES.NOMBRE_AREA} caracteres`);
            return false;
        }

        if (!descripcion) {
            this.mostrarError('La descripción es requerida');
            return false;
        }

        if (descripcion.length < 20) {
            this.mostrarError('La descripción debe tener al menos 20 caracteres');
            return false;
        }

        if (descripcion.length > LIMITES.DESCRIPCION_AREA) {
            this.mostrarError(`La descripción no puede exceder ${LIMITES.DESCRIPCION_AREA} caracteres`);
            return false;
        }

        if (nombreArea.length < 3) {
            this.mostrarError('El nombre del área debe tener al menos 3 caracteres');
            return false;
        }

        if (!responsableId) {
            this.mostrarError('Debe seleccionar un responsable para el área');
            return false;
        }

        const cargosActivosValidos = this.cargos.filter(c => c.estado === 'activo' && c.nombre && c.nombre.trim() !== '');
        if (cargosActivosValidos.length === 0) {
            this.mostrarError('Debe tener al menos un cargo activo con nombre');
            return false;
        }

        for (const cargo of cargosActivosValidos) {
            if (!this.validarLongitudCargo(cargo.nombre, cargo.descripcion)) {
                return false;
            }
        }

        return true;
    }

    hayCambios() {
        if (!this.datosOriginales) return true;

        const datosActuales = this.obtenerDatosCompletos();

        if (datosActuales.nombreArea !== this.datosOriginales.nombreArea) return true;
        if (datosActuales.descripcion !== this.datosOriginales.descripcion) return true;
        if (datosActuales.responsable !== this.datosOriginales.responsable) return true;

        const cargosActualesStr = JSON.stringify(datosActuales.cargos);
        const cargosOriginalesStr = JSON.stringify(this.datosOriginales.cargos);
        if (cargosActualesStr !== cargosOriginalesStr) return true;

        return false;
    }

    obtenerDatosCompletos() {
        const cargosObject = {};
        this.cargos.forEach(cargo => {
            cargosObject[cargo.id] = {
                nombre: cargo.nombre ? cargo.nombre.trim() : '',
                descripcion: cargo.descripcion ? cargo.descripcion.trim() : '',
                estado: cargo.estado || 'activo'
            };
        });

        const responsableId = document.getElementById('responsableId')?.value;
        const responsableNombre = document.getElementById('responsableNombre')?.value;

        return {
            nombreArea: document.getElementById('nombreArea').value.trim(),
            descripcion: document.getElementById('descripcionArea').value.trim(),
            cargos: cargosObject,
            responsable: responsableId,
            responsableNombre: responsableNombre
        };
    }

    async validarYPrepararGuardado() {
        try {
            if (!this.validarFormulario()) return;

            if (!this.hayCambios()) {
                this.mostrarNotificacion('No hay cambios para guardar', 'info');
                return;
            }

            const datosActualizados = this.obtenerDatosCompletos();

            const result = await Swal.fire({
                title: '¿Guardar cambios?',
                text: '¿Está seguro de guardar los cambios realizados?',
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Sí, guardar',
                cancelButtonText: 'Cancelar'
            });

            if (result.isConfirmed) {
                await this.confirmarGuardado(datosActualizados);
            }

        } catch (error) {
            this.mostrarError('Error validando datos');
        }
    }

    async confirmarGuardado(datosActualizados) {
        try {
            if (!this.areaActual) {
                throw new Error('No hay área para actualizar');
            }

            Swal.fire({
                title: 'Guardando cambios...',
                text: 'Por favor espera',
                allowOutsideClick: false,
                allowEscapeKey: false,
                showConfirmButton: false,
                willOpen: () => {
                    Swal.showLoading();
                }
            });

            await this.areaManager.actualizarArea(
                this.areaActual.id,
                datosActualizados,
                this.userManager.currentUser.id,
                this.userManager.currentUser.organizacionCamelCase,
                this.userManager.currentUser
            );

            Swal.close();

            this.datosOriginales = JSON.parse(JSON.stringify(this.obtenerDatosCompletos()));

            await Swal.fire({
                icon: 'success',
                title: '¡Guardado!',
                text: 'Los cambios se guardaron correctamente',
                timer: 2000,
                showConfirmButton: false
            });

            setTimeout(() => this.volverALista(), 2100);

        } catch (error) {
            Swal.close();
            console.error('Error guardando:', error);
            this.mostrarError('Error actualizando área: ' + error.message);
        }
    }

    volverALista() {
        window.location.href = '../areas/areas.html';
    }

    cancelarEdicion() {
        if (this.hayCambios()) {
            Swal.fire({
                title: '¿Cancelar edición?',
                text: "Los cambios no guardados se perderán",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Sí, cancelar',
                cancelButtonText: 'No, continuar'
            }).then((result) => {
                if (result.isConfirmed) this.volverALista();
            });
        } else {
            this.volverALista();
        }
    }

    mostrarError(mensaje) {
        this.mostrarNotificacion(mensaje, 'error');
    }

    mostrarNotificacion(mensaje, tipo = 'info', duracion = 3000) {
        Swal.fire({
            title: tipo === 'success' ? 'Éxito' :
                tipo === 'error' ? 'Error' :
                    tipo === 'warning' ? 'Advertencia' : 'Información',
            text: mensaje,
            icon: tipo,
            timer: duracion,
            timerProgressBar: true,
            showConfirmButton: false
        });
    }
}

cargarDependencias();