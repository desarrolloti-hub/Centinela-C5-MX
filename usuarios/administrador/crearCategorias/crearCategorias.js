// crearCategorias.js - VERSIÓN CON VALIDACIONES DE CARACTERES Y REGISTRO DE BITÁCORA
// SIN empresaId/estado, con herencia de color configurable

// Variable global para debugging
window.crearCategoriaDebug = {
    estado: 'iniciando',
    controller: null
};

// LÍMITES DE CARACTERES (basados en crearAreas.js)
const LIMITES = {
    NOMBRE_CATEGORIA: 50,
    DESCRIPCION_CATEGORIA: 500,
    NOMBRE_SUBCATEGORIA: 50,
    DESCRIPCION_SUBCATEGORIA: 200
};

// =============================================
// CLASE PRINCIPAL - CrearCategoriaController
// =============================================
class CrearCategoriaController {
    constructor() {
        this.categoriaManager = null;
        this.usuarioActual = null;
        this.categoriaEnProceso = null;
        this.categoriaCreadaReciente = null;
        this.loadingOverlay = null;
        this.notificacionActual = null;
        this.historialManager = null; // ✅ NUEVO: Para registrar actividades

        // Array para almacenar subcategorías
        this.subcategorias = [];

        // Inicializar
        this._init();
    }

    // ========== INICIALIZACIÓN ==========

    async _init() {
        try {
            // 1. Cargar usuario
            this._cargarUsuario();

            if (!this.usuarioActual) {
                throw new Error('No se pudo cargar información del usuario');
            }

            // 2. Inicializar historialManager
            await this._initHistorialManager();

            // 3. Cargar CategoriaManager
            await this._cargarCategoriaManager();

            // 4. Configurar eventos
            this._configurarEventos();

            // 5. Configurar organización automática
            this._configurarOrganizacion();

            // 6. Inicializar validaciones
            this._inicializarValidaciones();

            // 7. Inicializar gestión de subcategorías
            this._inicializarGestionSubcategorias();

            // 8. Aplicar límites de caracteres
            this._aplicarLimitesCaracteres();

            // 9. Actualizar UI con información de la organización (en el header)
            this._actualizarInfoOrganizacion();

            window.crearCategoriaDebug.controller = this;

        } catch (error) {
            console.error('Error inicializando:', error);
            this._mostrarError('Error al inicializar: ' + error.message);
        }
    }

    // ✅ NUEVO: Inicializar historialManager
    async _initHistorialManager() {
        try {
            const { HistorialUsuarioManager } = await import('/clases/historialUsuario.js');
            this.historialManager = new HistorialUsuarioManager();

        } catch (error) {
            console.error('Error inicializando historialManager:', error);
        }
    }

    // ✅ NUEVO: Registrar creación de categoría
    async _registrarCreacionCategoria(categoria) {
        if (!this.historialManager) return;

        try {
            const numSubcategorias = categoria.subcategorias ?
                (categoria.subcategorias.size || Object.keys(categoria.subcategorias).length) : 0;

            await this.historialManager.registrarActividad({
                usuario: this.usuarioActual,
                tipo: 'crear',
                modulo: 'categorias',
                descripcion: `Creó categoría: ${categoria.nombre}`,
                detalles: {
                    categoriaId: categoria.id,
                    categoriaNombre: categoria.nombre,
                    categoriaColor: categoria.color,
                    numeroSubcategorias: numSubcategorias,
                    subcategorias: this._getSubcategoriasNombres(categoria.subcategorias)
                }
            });

        } catch (error) {
            console.error('Error registrando creación de categoría:', error);
        }
    }

    // ✅ NUEVO: Obtener nombres de subcategorías para detalles
    _getSubcategoriasNombres(subcategorias) {
        if (!subcategorias) return [];

        const nombres = [];
        try {
            if (subcategorias.forEach) {
                subcategorias.forEach((value, key) => {
                    if (value && typeof value === 'object') {
                        nombres.push({
                            id: key,
                            nombre: value.nombre || 'Sin nombre'
                        });
                    }
                });
            } else {
                Object.keys(subcategorias).forEach(key => {
                    if (subcategorias[key] && subcategorias[key].nombre) {
                        nombres.push({
                            id: key,
                            nombre: subcategorias[key].nombre
                        });
                    }
                });
            }
        } catch (e) {
            console.error('Error obteniendo nombres de subcategorías:', e);
        }
        return nombres;
    }

    // ========== CARGA DE DEPENDENCIAS ==========

    async _cargarCategoriaManager() {
        try {
            const { CategoriaManager } = await import('/clases/categoria.js');
            this.categoriaManager = new CategoriaManager();
        } catch (error) {
            console.error('Error cargando CategoriaManager:', error);
            throw error;
        }
    }

    // ========== CARGA DE USUARIO ==========

    _cargarUsuario() {
        try {
            // PRIMERO: Intentar adminInfo (para administradores)
            const adminInfo = localStorage.getItem('adminInfo');
            if (adminInfo) {
                const adminData = JSON.parse(adminInfo);

                this.usuarioActual = {
                    id: adminData.id || `admin_${Date.now()}`,
                    uid: adminData.uid || adminData.id,
                    nombreCompleto: adminData.nombreCompleto || 'Administrador',
                    organizacion: adminData.organizacion || 'Sin organización',
                    organizacionCamelCase: adminData.organizacionCamelCase ||
                        this._generarCamelCase(adminData.organizacion),
                    correo: adminData.correoElectronico || ''
                };
                return;
            }

            // SEGUNDO: Intentar userData
            const userData = JSON.parse(localStorage.getItem('userData') || '{}');
            if (userData && Object.keys(userData).length > 0) {

                this.usuarioActual = {
                    id: userData.uid || userData.id || `user_${Date.now()}`,
                    uid: userData.uid || userData.id,
                    nombreCompleto: userData.nombreCompleto || userData.nombre || 'Usuario',
                    organizacion: userData.organizacion || userData.empresa || 'Sin organización',
                    organizacionCamelCase: userData.organizacionCamelCase ||
                        this._generarCamelCase(userData.organizacion || userData.empresa),
                    correo: userData.correo || userData.email || ''
                };
                return;
            }

            // TERCERO: Datos por defecto (para desarrollo)
            this.usuarioActual = {
                id: `admin_${Date.now()}`,
                uid: `admin_${Date.now()}`,
                nombreCompleto: 'Administrador',
                organizacion: 'pollos Ray',
                organizacionCamelCase: 'pollosRay',
                correo: 'admin@centinela.com'
            };

        } catch (error) {
            console.error('Error cargando usuario:', error);
            throw error;
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

    // ========== CONFIGURACIÓN DE ORGANIZACIÓN ==========

    _configurarOrganizacion() {
        // Estos inputs pueden no existir en el HTML, verificamos antes de usar
        const orgCamelCaseInput = document.getElementById('organizacionCamelCase');
        const orgNombreInput = document.getElementById('organizacionNombre');

        if (orgCamelCaseInput) {
            orgCamelCaseInput.value = this.usuarioActual.organizacionCamelCase;
        }

        if (orgNombreInput) {
            orgNombreInput.value = this.usuarioActual.organizacion;
        }
    }

    _actualizarInfoOrganizacion() {
        const container = document.getElementById('headerDescription');
        if (!container) return;

        const coleccion = `categorias_${this.usuarioActual.organizacionCamelCase}`;

        container.innerHTML = `
            <div style="margin-bottom: 8px;">
                <strong>Organización:</strong> ${this.usuarioActual.organizacion}
            </div>
            <div style="font-size: 0.9rem; opacity: 0.8;">
                <i class="fas fa-database"></i> Colección: ${coleccion}
            </div>
        `;
    }

    // ========== APLICAR LÍMITES DE CARACTERES ==========

    _aplicarLimitesCaracteres() {
        // Campo nombre categoría
        const nombreCategoria = document.getElementById('nombreCategoria');
        if (nombreCategoria) {
            nombreCategoria.maxLength = LIMITES.NOMBRE_CATEGORIA;
            nombreCategoria.addEventListener('input', () => this._validarLongitudCampo(
                nombreCategoria,
                LIMITES.NOMBRE_CATEGORIA,
                'El nombre de la categoría'
            ));
        }

        // Campo descripción categoría
        const descripcionCategoria = document.getElementById('descripcionCategoria');
        if (descripcionCategoria) {
            descripcionCategoria.maxLength = LIMITES.DESCRIPCION_CATEGORIA;
            descripcionCategoria.addEventListener('input', () => {
                this._validarLongitudCampo(
                    descripcionCategoria,
                    LIMITES.DESCRIPCION_CATEGORIA,
                    'La descripción'
                );
                this._actualizarContadorCaracteres();
            });
        }
    }

    _validarLongitudCampo(campo, limite, nombreCampo) {
        const longitud = campo.value.length;
        if (longitud > limite) {
            campo.value = campo.value.substring(0, limite);
            this._mostrarNotificacion(`${nombreCampo} no puede exceder ${limite} caracteres`, 'warning', 3000);
        }
    }

    _validarLongitudSubcategoria(nombre, descripcion) {
        if (nombre && nombre.length > LIMITES.NOMBRE_SUBCATEGORIA) {
            this._mostrarNotificacion(`El nombre de la subcategoría no puede exceder ${LIMITES.NOMBRE_SUBCATEGORIA} caracteres`, 'warning', 3000);
            return false;
        }
        if (descripcion && descripcion.length > LIMITES.DESCRIPCION_SUBCATEGORIA) {
            this._mostrarNotificacion(`La descripción de la subcategoría no puede exceder ${LIMITES.DESCRIPCION_SUBCATEGORIA} caracteres`, 'warning', 3000);
            return false;
        }
        return true;
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
            const btnCancelar = document.getElementById('btnCancelar');
            if (btnCancelar) {
                btnCancelar.addEventListener('click', () => this._cancelarCreacion());
            }

            // Botón Crear Categoría
            const btnCrearCategoria = document.getElementById('btnCrearCategoria');
            if (btnCrearCategoria) {
                btnCrearCategoria.addEventListener('click', (e) => {
                    e.preventDefault();
                    this._validarYGuardar();
                });
            }

            // Formulario Submit
            const form = document.getElementById('formCategoriaPrincipal');
            if (form) {
                form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this._validarYGuardar();
                });
            }

            // Color Preview
            const colorPreviewCard = document.getElementById('colorPreviewCard');
            const colorPickerNative = document.getElementById('colorPickerNative');

            if (colorPreviewCard && colorPickerNative) {
                colorPreviewCard.addEventListener('click', () => {
                    colorPickerNative.click();
                });

                colorPickerNative.addEventListener('input', (e) => {
                    const color = e.target.value;
                    const colorDisplay = document.getElementById('colorDisplay');
                    const colorHex = document.getElementById('colorHex');

                    if (colorDisplay) {
                        colorDisplay.style.backgroundColor = color;
                    }
                    if (colorHex) {
                        colorHex.textContent = color;
                    }

                    // Actualizar previsualización de colores en subcategorías
                    this._renderizarSubcategorias();
                });
            }

            // Contador de caracteres
            const descripcionInput = document.getElementById('descripcionCategoria');
            if (descripcionInput) {
                descripcionInput.addEventListener('input', () => this._actualizarContadorCaracteres());
            }

        } catch (error) {
            console.error('Error configurando eventos:', error);
        }
    }

    _inicializarValidaciones() {
        this._actualizarContadorCaracteres();
    }

    _actualizarContadorCaracteres() {
        const descripcion = document.getElementById('descripcionCategoria');
        const contador = document.getElementById('contadorCaracteres');

        if (descripcion && contador) {
            const longitud = descripcion.value.length;
            contador.textContent = `${longitud}/${LIMITES.DESCRIPCION_CATEGORIA}`;

            // Cambiar color si se acerca al límite
            if (longitud > LIMITES.DESCRIPCION_CATEGORIA * 0.9) {
                contador.style.color = 'var(--color-warning)';
            } else if (longitud > LIMITES.DESCRIPCION_CATEGORIA * 0.95) {
                contador.style.color = 'var(--color-danger)';
            } else {
                contador.style.color = 'var(--color-accent-primary)';
            }
        }
    }

    // ========== GESTIÓN DE SUBCATEGORÍAS ==========

    _inicializarGestionSubcategorias() {
        const btnAgregar = document.getElementById('btnAgregarSubcategoria');
        if (btnAgregar) {
            btnAgregar.addEventListener('click', () => this._agregarSubcategoria());
        }
    }

    _agregarSubcategoria() {
        const subcatId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

        this.subcategorias.push({
            id: subcatId,
            nombre: '',
            descripcion: '',
            heredaColor: true,
            colorPersonalizado: '#ff5733'
        });

        this._renderizarSubcategorias();
        this._actualizarContadorSubcategorias();

        // Enfocar en el nombre
        setTimeout(() => {
            const input = document.getElementById(`subcat_nombre_${subcatId}`);
            if (input) {
                input.focus();
                input.maxLength = LIMITES.NOMBRE_SUBCATEGORIA;
            }
        }, 100);
    }

    _eliminarSubcategoria(subcatId) {
        Swal.fire({
            title: '¿Eliminar subcategoría?',
            text: 'Esta acción no se puede deshacer',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar'
        }).then((result) => {
            if (result.isConfirmed) {
                this.subcategorias = this.subcategorias.filter(s => s.id !== subcatId);
                this._renderizarSubcategorias();
                this._actualizarContadorSubcategorias();
                this._mostrarNotificacion('Subcategoría eliminada', 'success');
            }
        });
    }

    _actualizarSubcategoria(subcatId, campo, valor) {
        const subcategoria = this.subcategorias.find(s => s.id === subcatId);
        if (subcategoria) {
            // Validar límites de caracteres
            if (campo === 'nombre' && valor.length > LIMITES.NOMBRE_SUBCATEGORIA) {
                valor = valor.substring(0, LIMITES.NOMBRE_SUBCATEGORIA);
                this._mostrarNotificacion(`El nombre no puede exceder ${LIMITES.NOMBRE_SUBCATEGORIA} caracteres`, 'warning', 3000);
            }
            if (campo === 'descripcion' && valor.length > LIMITES.DESCRIPCION_SUBCATEGORIA) {
                valor = valor.substring(0, LIMITES.DESCRIPCION_SUBCATEGORIA);
                this._mostrarNotificacion(`La descripción no puede exceder ${LIMITES.DESCRIPCION_SUBCATEGORIA} caracteres`, 'warning', 3000);
            }
            subcategoria[campo] = valor;

            // Actualizar contador si existe
            this._actualizarContadorSubcategoria(subcatId, campo, valor);
        }
    }

    _actualizarContadorSubcategoria(subcatId, campo, valor) {
        const input = document.getElementById(`subcat_${campo}_${subcatId}`);
        if (input) {
            const counter = input.closest('.subcategoria-campo')?.querySelector('.char-counter');
            if (counter) {
                const limite = campo === 'nombre' ? LIMITES.NOMBRE_SUBCATEGORIA : LIMITES.DESCRIPCION_SUBCATEGORIA;
                counter.textContent = `${valor?.length || 0}/${limite}`;
            }
        }
    }

    _cambiarHerenciaColor(subcatId, heredaColor) {
        const subcategoria = this.subcategorias.find(s => s.id === subcatId);
        if (subcategoria) {
            subcategoria.heredaColor = heredaColor;
            this._renderizarSubcategorias();
        }
    }

    _actualizarColorPersonalizado(subcatId, color) {
        const subcategoria = this.subcategorias.find(s => s.id === subcatId);
        if (subcategoria) {
            subcategoria.colorPersonalizado = color;
        }
    }

    _renderizarSubcategorias() {
        const container = document.getElementById('subcategoriasList');
        if (!container) return;

        if (this.subcategorias.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-sitemap"></i>
                    <p>No hay subcategorías agregadas</p>
                    <small>Haga clic en "Agregar Subcategoría" para añadir una</small>
                </div>
            `;
            return;
        }

        let html = '';
        const colorCategoria = document.getElementById('colorPickerNative')?.value || '#2f8cff';

        this.subcategorias.forEach((subcat, index) => {
            const colorEfectivo = subcat.heredaColor ? colorCategoria : (subcat.colorPersonalizado || '#ff5733');

            html += `
                <div class="subcategoria-item" id="subcategoria_${subcat.id}" style="border-left: 4px solid ${colorEfectivo};">
                    <div class="subcategoria-header">
                        <div class="subcategoria-titulo">
                            <i class="fas fa-folder"></i>
                            Subcategoría #${index + 1}
                            <span class="color-badge" style="background: ${colorEfectivo}; width: 16px; height: 16px; border-radius: 4px; display: inline-block; margin-left: 8px;"></span>
                        </div>
                        <button type="button" class="btn-eliminar-subcategoria" 
                                onclick="window.crearCategoriaDebug.controller._eliminarSubcategoria('${subcat.id}')">
                            <i class="fas fa-trash-alt"></i>
                            Eliminar
                        </button>
                    </div>
                    
                    <div class="subcategoria-grid">
                        <div class="subcategoria-campo">
                            <label class="subcategoria-label">
                                <i class="fas fa-tag"></i>
                                Nombre *
                            </label>
                            <input type="text" class="subcategoria-input" 
                                   id="subcat_nombre_${subcat.id}"
                                   value="${this._escapeHTML(subcat.nombre)}"
                                   placeholder="Ej: Procesadores, Ventas, Redes"
                                   maxlength="${LIMITES.NOMBRE_SUBCATEGORIA}"
                                   oninput="window.crearCategoriaDebug.controller._actualizarSubcategoria('${subcat.id}', 'nombre', this.value)">
                            <div class="char-limit-info">
                                <span class="char-counter">${subcat.nombre?.length || 0}/${LIMITES.NOMBRE_SUBCATEGORIA}</span>
                            </div>
                        </div>
                        <div class="subcategoria-campo">
                            <label class="subcategoria-label">
                                <i class="fas fa-align-left"></i>
                                Descripción
                            </label>
                            <input type="text" class="subcategoria-input" 
                                   id="subcat_descripcion_${subcat.id}"
                                   value="${this._escapeHTML(subcat.descripcion)}"
                                   placeholder="Descripción opcional"
                                   maxlength="${LIMITES.DESCRIPCION_SUBCATEGORIA}"
                                   oninput="window.crearCategoriaDebug.controller._actualizarSubcategoria('${subcat.id}', 'descripcion', this.value)">
                            <div class="char-limit-info">
                                <span class="char-counter">${subcat.descripcion?.length || 0}/${LIMITES.DESCRIPCION_SUBCATEGORIA}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="subcategoria-color-control">
                        <div class="herencia-color">
                            <label class="herencia-checkbox">
                                <input type="checkbox" 
                                       ${subcat.heredaColor ? 'checked' : ''}
                                       onchange="window.crearCategoriaDebug.controller._cambiarHerenciaColor('${subcat.id}', this.checked)">
                                <span> color de categoría</span>
                            </label>
                        </div>
                        
                        <div class="color-personalizado" style="${subcat.heredaColor ? 'opacity: 0.5; pointer-events: none;' : ''}">
                            <span class="color-personalizado-label">
                                <i class="fas fa-palette"></i>
                                Color:
                            </span>
                            <input type="color" class="color-personalizado-input" 
                                   id="subcat_color_${subcat.id}"
                                   value="${subcat.colorPersonalizado || '#ff5733'}"
                                   ${subcat.heredaColor ? 'disabled' : ''}
                                   onchange="window.crearCategoriaDebug.controller._actualizarColorPersonalizado('${subcat.id}', this.value);
                                            window.crearCategoriaDebug.controller._renderizarSubcategorias();">
                        </div>
                        
                        <div class="color-actual">
                            <span>Color efectivo:</span>
                            <span class="color-muestra" style="background: ${colorEfectivo};"></span>
                            <span>${colorEfectivo}</span>
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    _actualizarContadorSubcategorias() {
        const counter = document.getElementById('subcategoriasCounter');
        if (counter) {
            const cantidad = this.subcategorias.length;
            counter.textContent = `(${cantidad} subcategoría${cantidad !== 1 ? 's' : ''})`;
        }
    }

    _escapeHTML(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // ========== VALIDACIÓN Y GUARDADO ==========

    _validarYGuardar() {
        // Validar nombre
        const nombreInput = document.getElementById('nombreCategoria');
        const nombre = nombreInput.value.trim();

        if (!nombre) {
            nombreInput.classList.add('is-invalid');
            this._mostrarError('El nombre de la categoría es obligatorio');
            return;
        }

        if (nombre.length < 3) {
            nombreInput.classList.add('is-invalid');
            this._mostrarError('El nombre debe tener al menos 3 caracteres');
            return;
        }

        if (nombre.length > LIMITES.NOMBRE_CATEGORIA) {
            nombreInput.classList.add('is-invalid');
            this._mostrarError(`El nombre no puede exceder ${LIMITES.NOMBRE_CATEGORIA} caracteres`);
            return;
        }

        nombreInput.classList.remove('is-invalid');

        // Validar descripción
        const descripcionInput = document.getElementById('descripcionCategoria');
        const descripcion = descripcionInput.value.trim();

        if (descripcion.length > LIMITES.DESCRIPCION_CATEGORIA) {
            descripcionInput.classList.add('is-invalid');
            this._mostrarError(`La descripción no puede exceder ${LIMITES.DESCRIPCION_CATEGORIA} caracteres`);
            return;
        }
        descripcionInput.classList.remove('is-invalid');

        // Validar subcategorías
        const subcategoriasValidas = this.subcategorias.filter(s => s.nombre && s.nombre.trim() !== '');
        if (this.subcategorias.length > 0 && subcategoriasValidas.length === 0) {
            this._mostrarError('Las subcategorías agregadas deben tener nombre');
            return;
        }

        // Validar nombres duplicados en subcategorías
        const nombres = subcategoriasValidas.map(s => s.nombre.trim().toLowerCase());
        const duplicados = nombres.filter((nombre, index) => nombres.indexOf(nombre) !== index);
        if (duplicados.length > 0) {
            this._mostrarError('No puede haber subcategorías con el mismo nombre');
            return;
        }

        // Validar límites de caracteres en subcategorías
        for (const subcat of subcategoriasValidas) {
            if (!this._validarLongitudSubcategoria(subcat.nombre, subcat.descripcion)) {
                return;
            }
        }

        // Obtener datos
        const datos = this._obtenerDatosFormulario(subcategoriasValidas);

        // Guardar
        this._guardarCategoria(datos);
    }

    _obtenerDatosFormulario(subcategoriasValidas) {
        const nombre = document.getElementById('nombreCategoria').value.trim();
        const descripcion = document.getElementById('descripcionCategoria').value.trim();
        const color = document.getElementById('colorPickerNative')?.value || '#2f8cff';

        // Procesar subcategorías - SOLO IDs TEMPORALES
        const subcategorias = {};

        subcategoriasValidas.forEach(subcat => {
            const tempId = subcat.id;
            subcategorias[tempId] = {
                id: tempId, // Temporal, se mantiene para referencia
                nombre: subcat.nombre.trim(),
                descripcion: subcat.descripcion?.trim() || '',
                fechaCreacion: new Date().toISOString(),
                fechaActualizacion: new Date().toISOString(),
                heredaColor: subcat.heredaColor !== undefined ? subcat.heredaColor : true,
                color: !subcat.heredaColor ? (subcat.colorPersonalizado || null) : null
            };
        });

        return {
            nombre: nombre,
            descripcion: descripcion,
            color: color,
            subcategorias: subcategorias,
            organizacionCamelCase: this.usuarioActual.organizacionCamelCase,
            organizacionNombre: this.usuarioActual.organizacion
        };
    }

    async _guardarCategoria(datos) {
        const btnCrear = document.getElementById('btnCrearCategoria');
        const originalHTML = btnCrear ? btnCrear.innerHTML : '<i class="fas fa-check me-2"></i>Crear Categoría';

        try {
            if (btnCrear) {
                btnCrear.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Guardando...';
                btnCrear.disabled = true;
            }

            // Verificar si ya existe
            const existe = await this.categoriaManager.verificarCategoriaExistente(
                datos.nombre,
                this.usuarioActual.organizacionCamelCase
            );

            if (existe) {
                this._mostrarError(`Ya existe una categoría con el nombre "${datos.nombre}"`);
                return;
            }

            // Crear categoría
            const nuevaCategoria = await this.categoriaManager.crearCategoria(datos);

            this.categoriaCreadaReciente = nuevaCategoria;

            // ✅ NUEVO: Registrar creación en bitácora
            await this._registrarCreacionCategoria(nuevaCategoria);

            // Mostrar éxito
            await Swal.fire({
                icon: 'success',
                title: '¡Categoría creada!',
                text: 'La categoría se ha guardado correctamente.',
                confirmButtonText: 'Ver categorías'
            });

            this._volverALista();

        } catch (error) {
            console.error('Error guardando categoría:', error);
            this._mostrarError(error.message || 'No se pudo crear la categoría');
        } finally {
            if (btnCrear) {
                btnCrear.innerHTML = originalHTML;
                btnCrear.disabled = false;
            }
        }
    }

    // ========== NAVEGACIÓN ==========

    _volverALista() {
        window.location.href = '../categorias/categorias.html';
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
        this._mostrarNotificacion(mensaje, 'error');
    }

    _mostrarNotificacion(mensaje, tipo = 'info', duracion = 5000) {
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

    _mostrarCargando(mensaje = 'Guardando...') {
        if (this.loadingOverlay) {
            this.loadingOverlay.remove();
        }

        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="spinner"></div>
            <div class="loading-text">${mensaje}</div>
        `;

        document.body.appendChild(overlay);
        this.loadingOverlay = overlay;
    }

    _ocultarCargando() {
        if (this.loadingOverlay) {
            this.loadingOverlay.remove();
            this.loadingOverlay = null;
        }
    }
}

// =============================================
// INICIALIZACIÓN
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    window.crearCategoriaDebug.controller = new CrearCategoriaController();
});