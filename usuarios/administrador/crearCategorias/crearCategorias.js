// crearCategorias.js - COMPLETO CON SLIDER ARRASTRABLE Y GRADIENTE
import { CategoriaManager } from '/clases/categoria.js';
import { RiesgoNivelManager } from '/clases/riesgoNivel.js';

const LIMITES = {
    NOMBRE_CATEGORIA: 50,
    DESCRIPCION_CATEGORIA: 500,
    NOMBRE_SUBCATEGORIA: 50,
    DESCRIPCION_SUBCATEGORIA: 200
};

class CrearCategoriaController {
    constructor() {
        this.categoriaManager = null;
        this.riesgoNivelManager = null;
        this.usuarioActual = null;
        this.subcategorias = [];
        this.nivelesRiesgo = [];
        this._init();
    }

    async _init() {
        try {
            this._cargarUsuario();
            if (!this.usuarioActual) throw new Error('No se pudo cargar el usuario');

            await this._cargarCategoriaManager();
            await this._inicializarRiesgoNivelManager();
            await this._cargarNivelesRiesgo();

            this._configurarEventos();
            this._configurarOrganizacion();
            this._inicializarValidaciones();
            this._inicializarGestionSubcategorias();
            this._aplicarLimitesCaracteres();
            this._actualizarInfoOrganizacion();

            window.crearCategoriaDebug = { controller: this };
        } catch (error) {
            console.error('Error inicializando:', error);
            this._mostrarError('Error al inicializar: ' + error.message);
        }
    }

    _cargarUsuario() {
        try {
            const adminInfo = localStorage.getItem('adminInfo');
            if (adminInfo) {
                const data = JSON.parse(adminInfo);
                this.usuarioActual = {
                    id: data.id || data.uid,
                    nombreCompleto: data.nombreCompleto || 'Administrador',
                    organizacion: data.organizacion,
                    organizacionCamelCase: data.organizacionCamelCase || this._generarCamelCase(data.organizacion),
                    correo: data.correoElectronico || ''
                };
                return;
            }
            const userData = JSON.parse(localStorage.getItem('userData') || '{}');
            if (userData && Object.keys(userData).length) {
                this.usuarioActual = {
                    id: userData.uid || userData.id,
                    nombreCompleto: userData.nombreCompleto || userData.nombre || 'Usuario',
                    organizacion: userData.organizacion || userData.empresa,
                    organizacionCamelCase: userData.organizacionCamelCase || this._generarCamelCase(userData.organizacion),
                    correo: userData.correo || userData.email || ''
                };
                return;
            }
            this.usuarioActual = {
                id: `admin_${Date.now()}`,
                nombreCompleto: 'Administrador',
                organizacion: 'Mi Empresa',
                organizacionCamelCase: 'miEmpresa',
                correo: 'admin@centinela.com'
            };
        } catch (error) {
            console.error('Error cargando usuario:', error);
            throw error;
        }
    }

    _generarCamelCase(texto) {
        if (!texto) return 'sinOrganizacion';
        return texto.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
            .replace(/[^a-zA-Z0-9]/g, '');
    }

    async _cargarCategoriaManager() {
        const { CategoriaManager } = await import('/clases/categoria.js');
        this.categoriaManager = new CategoriaManager();
    }

    async _inicializarRiesgoNivelManager() {
        try {
            this.riesgoNivelManager = new RiesgoNivelManager();
        } catch (error) {
            console.error('Error cargando RiesgoNivelManager:', error);
        }
    }

    async _cargarNivelesRiesgo() {
        if (!this.riesgoNivelManager) return;
        try {
            this.nivelesRiesgo = await this.riesgoNivelManager.obtenerTodosNiveles(this.usuarioActual.organizacionCamelCase);
        } catch (error) {
            console.error('Error cargando niveles:', error);
            this.nivelesRiesgo = [];
        }
    }

    _configurarEventos() {
        document.getElementById('btnVolverLista')?.addEventListener('click', () => this._volverALista());
        document.getElementById('btnCancelar')?.addEventListener('click', () => this._cancelarCreacion());
        document.getElementById('btnCrearCategoria')?.addEventListener('click', (e) => { e.preventDefault(); this._validarYGuardar(); });
        document.getElementById('formCategoriaPrincipal')?.addEventListener('submit', (e) => { e.preventDefault(); this._validarYGuardar(); });

        const colorPreview = document.getElementById('colorPreviewCard');
        const colorPicker = document.getElementById('colorPickerNative');
        if (colorPreview && colorPicker) {
            colorPreview.addEventListener('click', () => colorPicker.click());
            colorPicker.addEventListener('input', (e) => {
                document.getElementById('colorDisplay').style.backgroundColor = e.target.value;
                document.getElementById('colorHex').textContent = e.target.value;
                this._renderizarSubcategorias(); // actualizar todas las subcategorías que heredan
            });
        }
    }

    _configurarOrganizacion() {}

    _inicializarValidaciones() {
        const descripcion = document.getElementById('descripcionCategoria');
        if (descripcion) descripcion.addEventListener('input', () => this._actualizarContadorCaracteres());
        this._actualizarContadorCaracteres();
    }

    _actualizarContadorCaracteres() {
        const desc = document.getElementById('descripcionCategoria');
        const contador = document.getElementById('contadorCaracteres');
        if (desc && contador) {
            const len = desc.value.length;
            contador.textContent = `${len}/${LIMITES.DESCRIPCION_CATEGORIA}`;
            contador.style.color = len > LIMITES.DESCRIPCION_CATEGORIA * 0.9 ? 'var(--color-warning)' : 'var(--color-accent-primary)';
        }
    }

    _aplicarLimitesCaracteres() {
        const nombreCat = document.getElementById('nombreCategoria');
        if (nombreCat) nombreCat.maxLength = LIMITES.NOMBRE_CATEGORIA;
        const descCat = document.getElementById('descripcionCategoria');
        if (descCat) descCat.maxLength = LIMITES.DESCRIPCION_CATEGORIA;
    }

    _actualizarInfoOrganizacion() {
        const header = document.getElementById('headerDescription');
        if (header) header.innerHTML = `<strong>Organización:</strong> ${this.usuarioActual.organizacion}`;
    }

    _inicializarGestionSubcategorias() {
        document.getElementById('btnAgregarSubcategoria')?.addEventListener('click', () => this._agregarSubcategoria());
    }

    _agregarSubcategoria() {
        const subcatId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        this.subcategorias.push({
            id: subcatId,
            nombre: '',
            descripcion: '',
            heredaColor: true,
            brightnessFactor: 1.0,
            colorPersonalizado: null,
            riesgoNivelId: ''
        });
        this._renderizarSubcategorias();
        setTimeout(() => {
            const input = document.getElementById(`subcat_nombre_${subcatId}`);
            if (input) input.focus();
        }, 100);
    }

    _eliminarSubcategoria(subcatId) {
        Swal.fire({
            title: '¿Eliminar subcategoría?',
            text: 'Esta acción no se puede deshacer',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar'
        }).then(result => {
            if (result.isConfirmed) {
                this.subcategorias = this.subcategorias.filter(s => s.id !== subcatId);
                this._renderizarSubcategorias();
            }
        });
    }

    _actualizarSubcategoria(subcatId, campo, valor) {
        const subcat = this.subcategorias.find(s => s.id === subcatId);
        if (subcat) {
            if (campo === 'nombre' && valor.length > LIMITES.NOMBRE_SUBCATEGORIA) valor = valor.slice(0, LIMITES.NOMBRE_SUBCATEGORIA);
            if (campo === 'descripcion' && valor.length > LIMITES.DESCRIPCION_SUBCATEGORIA) valor = valor.slice(0, LIMITES.DESCRIPCION_SUBCATEGORIA);
            subcat[campo] = valor;
            this._actualizarContadorSubcampo(subcatId, campo, valor);
        }
    }

    _actualizarContadorSubcampo(subcatId, campo, valor) {
        const input = document.getElementById(`subcat_${campo}_${subcatId}`);
        if (input) {
            const parent = input.closest('.subcategoria-campo') || input.closest('.subcategoria-campo-full');
            const counter = parent?.querySelector('.char-counter');
            if (counter) {
                const limite = campo === 'nombre' ? LIMITES.NOMBRE_SUBCATEGORIA : LIMITES.DESCRIPCION_SUBCATEGORIA;
                counter.textContent = `${(valor || '').length}/${limite}`;
            }
        }
    }

    _cambiarHerenciaColor(subcatId, hereda) {
        const subcat = this.subcategorias.find(s => s.id === subcatId);
        if (subcat) {
            subcat.heredaColor = hereda;
            if (hereda) {
                subcat.brightnessFactor = 1.0;
                subcat.colorPersonalizado = null;
            } else {
                if (!subcat.colorPersonalizado) {
                    const catColor = document.getElementById('colorPickerNative')?.value || '#2f8cff';
                    subcat.colorPersonalizado = catColor;
                }
            }
            this._renderizarSubcategorias();
        }
    }

    // Actualiza el factor de brillo en tiempo real (usando input)
    _actualizarBrightnessFactor(subcatId, percentValue) {
        const subcat = this.subcategorias.find(s => s.id === subcatId);
        if (subcat && subcat.heredaColor) {
            const factor = 0.5 + (percentValue / 100);
            subcat.brightnessFactor = Math.min(1.5, Math.max(0.5, factor));
            // Actualizar solo la vista previa del color sin re-renderizar todo
            this._actualizarVistaPreviaColorSubcategoria(subcatId);
        }
    }

    // Método para actualizar dinámicamente el color efectivo y los elementos visuales
    _actualizarVistaPreviaColorSubcategoria(subcatId) {
        const subcat = this.subcategorias.find(s => s.id === subcatId);
        if (!subcat) return;
        const colorCategoria = document.getElementById('colorPickerNative')?.value || '#2f8cff';
        const colorEfectivo = this._calcularColorEfectivo(subcat, colorCategoria);
        
        const itemDiv = document.getElementById(`subcategoria_${subcatId}`);
        if (itemDiv) {
            // Borde izquierdo
            itemDiv.style.borderLeftColor = colorEfectivo;
            // Badge de color
            const badge = itemDiv.querySelector('.color-badge');
            if (badge) badge.style.backgroundColor = colorEfectivo;
            // Muestra de color efectivo
            const muestra = itemDiv.querySelector('.color-muestra');
            if (muestra) muestra.style.backgroundColor = colorEfectivo;
            // Texto hexadecimal
            const hexSpan = itemDiv.querySelector('.color-actual span:last-child');
            if (hexSpan) hexSpan.textContent = colorEfectivo;
            // Mini hex en el control de tonalidad
            const hexMini = itemDiv.querySelector('.color-hex-mini');
            if (hexMini) hexMini.textContent = colorEfectivo;
            // Actualizar el valor porcentual del slider
            const percentSpan = itemDiv.querySelector('.tonalidad-valor');
            if (percentSpan) {
                const percent = Math.round((subcat.brightnessFactor - 0.5) * 100);
                percentSpan.textContent = `${percent}%`;
            }
            // Si el slider existe, no es necesario actualizar su posición porque el evento input ya lo maneja
        }
    }

    _actualizarColorPersonalizado(subcatId, color) {
        const subcat = this.subcategorias.find(s => s.id === subcatId);
        if (subcat && !subcat.heredaColor) {
            subcat.colorPersonalizado = color;
            this._renderizarSubcategorias();
        }
    }

    _hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    _adjustBrightness(rgb, factor) {
        let r = Math.min(255, Math.max(0, Math.round(rgb.r * factor)));
        let g = Math.min(255, Math.max(0, Math.round(rgb.g * factor)));
        let b = Math.min(255, Math.max(0, Math.round(rgb.b * factor)));
        return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
    }

    _calcularColorEfectivo(subcat, colorCategoria) {
        if (!subcat.heredaColor) {
            return subcat.colorPersonalizado || colorCategoria;
        }
        const rgb = this._hexToRgb(colorCategoria);
        if (!rgb) return colorCategoria;
        let factor = subcat.brightnessFactor;
        factor = Math.min(1.5, Math.max(0.5, factor));
        return this._adjustBrightness(rgb, factor);
    }

    // ========== RENDERIZADO PRINCIPAL CON SLIDER MEJORADO ==========
    _renderizarSubcategorias() {
        const container = document.getElementById('subcategoriasList');
        if (!container) return;

        if (this.subcategorias.length === 0) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-sitemap"></i><p>No hay subcategorías agregadas</p><small>Haga clic en "Agregar Subcategoría"</small></div>`;
            return;
        }

        const colorCategoria = document.getElementById('colorPickerNative')?.value || '#2f8cff';
        let html = '';

        this.subcategorias.forEach((subcat, idx) => {
            const colorEfectivo = this._calcularColorEfectivo(subcat, colorCategoria);
            const sliderValue = subcat.heredaColor ? Math.round((subcat.brightnessFactor - 0.5) * 100) : 50;
            
            // Generar gradiente para el slider (desde oscuro hasta claro)
            const rgbBase = this._hexToRgb(colorCategoria);
            const darkColor = rgbBase ? this._adjustBrightness(rgbBase, 0.5) : '#2f8cff';
            const lightColor = rgbBase ? this._adjustBrightness(rgbBase, 1.5) : '#2f8cff';
            const sliderGradient = `linear-gradient(90deg, ${darkColor} 0%, ${colorCategoria} 50%, ${lightColor} 100%)`;

            // Opciones del select de niveles de riesgo
            let riesgoOptions = '<option value="">-- Seleccionar --</option>';
            this.nivelesRiesgo.forEach(nivel => {
                const selected = (subcat.riesgoNivelId === nivel.id) ? 'selected' : '';
                riesgoOptions += `<option value="${nivel.id}" ${selected}>${this._escapeHTML(nivel.nombre)} (${nivel.color})</option>`;
            });
            riesgoOptions += '<option value="__otro__" ' + (subcat.riesgoNivelId === '__otro__' ? 'selected' : '') + '>Crear nuevo nivel</option>';
            const showNuevoRiesgo = (subcat.riesgoNivelId === '__otro__') ? 'block' : 'none';

            html += `
                <div class="subcategoria-item" style="border-left: 4px solid ${colorEfectivo}; transition: border-left-color 0.1s ease;" id="subcategoria_${subcat.id}">
                    <div class="subcategoria-header">
                        <div class="subcategoria-titulo">
                            <i class="fas fa-folder"></i> Subcategoría #${idx + 1}
                            <span class="color-badge" style="background:${colorEfectivo}; width:16px; height:16px; border-radius:4px; display:inline-block; margin-left:8px; transition: background 0.1s ease;"></span>
                        </div>
                        <button type="button" class="btn-eliminar-subcategoria" onclick="window.crearCategoriaDebug.controller._eliminarSubcategoria('${subcat.id}')">
                            <i class="fas fa-trash-alt"></i> Eliminar
                        </button>
                    </div>
                    <!-- Primera fila: Nombre + Nivel de Riesgo -->
                    <div class="subcategoria-row-2cols">
                        <div class="subcategoria-campo">
                            <label><i class="fas fa-tag"></i> Nombre *</label>
                            <input type="text" class="subcategoria-input" id="subcat_nombre_${subcat.id}"
                                value="${this._escapeHTML(subcat.nombre)}" maxlength="${LIMITES.NOMBRE_SUBCATEGORIA}"
                                oninput="window.crearCategoriaDebug.controller._actualizarSubcategoria('${subcat.id}', 'nombre', this.value)">
                            <div class="char-limit-info"><span class="char-counter">${subcat.nombre.length}/${LIMITES.NOMBRE_SUBCATEGORIA}</span></div>
                        </div>
                        <div class="subcategoria-campo">
                            <label><i class="fas fa-chart-line"></i> Nivel de Riesgo</label>
                            <div class="riesgo-select-wrapper">
                                <select class="subcategoria-select-riesgo" data-subcat-id="${subcat.id}"
                                    onchange="window.crearCategoriaDebug.controller._cambiarRiesgoSeleccionado('${subcat.id}', this.value)">
                                    ${riesgoOptions}
                                </select>
                                <div id="nuevoRiesgoContainer_${subcat.id}" class="nuevo-riesgo-container" style="display: ${showNuevoRiesgo}; margin-top: 8px;">
                                    <input type="text" class="form-control" placeholder="Nombre del nuevo nivel" id="nuevoRiesgoNombre_${subcat.id}" maxlength="50">
                                    <div style="display: flex; gap: 8px; margin-top: 5px; align-items: center;">
                                        <input type="color" id="nuevoRiesgoColor_${subcat.id}" value="#2f8cff" style="width: 36px; height: 36px;">
                                        <span style="flex:1;">Color</span>
                                        <button type="button" class="btn-crear-riesgo" data-subcat-id="${subcat.id}">Crear y asignar</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <!-- Segunda fila: Descripción (ancho completo) -->
                    <div class="subcategoria-campo-full">
                        <label><i class="fas fa-align-left"></i> Descripción</label>
                        <input type="text" class="subcategoria-input" id="subcat_descripcion_${subcat.id}"
                            value="${this._escapeHTML(subcat.descripcion)}" maxlength="${LIMITES.DESCRIPCION_SUBCATEGORIA}"
                            oninput="window.crearCategoriaDebug.controller._actualizarSubcategoria('${subcat.id}', 'descripcion', this.value)">
                        <div class="char-limit-info"><span class="char-counter">${subcat.descripcion.length}/${LIMITES.DESCRIPCION_SUBCATEGORIA}</span></div>
                    </div>
                    <!-- Tercera fila: controles de color -->
                    <div class="subcategoria-color-control">
                        <div class="herencia-color">
                            <label class="herencia-checkbox">
                                <input type="checkbox" ${subcat.heredaColor ? 'checked' : ''}
                                    onchange="window.crearCategoriaDebug.controller._cambiarHerenciaColor('${subcat.id}', this.checked)">
                                <span> Heredar color de categoría</span>
                            </label>
                        </div>
                        ${subcat.heredaColor ? `
                        <div class="tonalidad-control">
                            <span class="tonalidad-label"><i class="fas fa-adjust"></i> Brillo:</span>
                            <input type="range" class="tonalidad-slider" min="0" max="100" value="${sliderValue}"
                                style="background: ${sliderGradient};"
                                oninput="window.crearCategoriaDebug.controller._actualizarBrightnessFactor('${subcat.id}', this.value)">
                            <span class="tonalidad-valor">${sliderValue}%</span>
                            <span class="color-hex-mini">${colorEfectivo}</span>
                        </div>
                        ` : `
                        <div class="color-personalizado">
                            <span><i class="fas fa-palette"></i> Color:</span>
                            <input type="color" class="color-personalizado-input" id="subcat_color_${subcat.id}"
                                value="${subcat.colorPersonalizado || '#ff5733'}"
                                onchange="window.crearCategoriaDebug.controller._actualizarColorPersonalizado('${subcat.id}', this.value);
                                         window.crearCategoriaDebug.controller._renderizarSubcategorias();">
                        </div>
                        `}
                        <div class="color-actual">
                            <span>Color efectivo:</span>
                            <span class="color-muestra" style="background:${colorEfectivo};"></span>
                            <span>${colorEfectivo}</span>
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        // Agregar event listeners a los botones "Crear y asignar"
        document.querySelectorAll('.btn-crear-riesgo').forEach(btn => {
            btn.removeEventListener('click', this._handler);
            const handler = async () => {
                const subcatId = btn.dataset.subcatId;
                await this._crearNuevoRiesgoYAsignar(subcatId);
            };
            btn.addEventListener('click', handler);
            btn._handler = handler;
        });
    }

    // ========== LÓGICA DE NIVELES DE RIESGO ==========
    _cambiarRiesgoSeleccionado(subcatId, valor) {
        const subcat = this.subcategorias.find(s => s.id === subcatId);
        if (!subcat) return;

        const container = document.getElementById(`nuevoRiesgoContainer_${subcatId}`);
        if (valor === '__otro__') {
            if (container) container.style.display = 'block';
            subcat.riesgoNivelId = '__otro__';
        } else {
            if (container) container.style.display = 'none';
            subcat.riesgoNivelId = valor;
        }
    }

    async _crearNuevoRiesgoYAsignar(subcatId) {
        const subcat = this.subcategorias.find(s => s.id === subcatId);
        if (!subcat) return;

        const nombreInput = document.getElementById(`nuevoRiesgoNombre_${subcatId}`);
        const colorInput = document.getElementById(`nuevoRiesgoColor_${subcatId}`);
        const nombre = nombreInput?.value.trim();
        const color = colorInput?.value || '#2f8cff';

        if (!nombre) {
            this._mostrarError('Debes escribir un nombre para el nuevo nivel de riesgo');
            return;
        }

        const btn = document.querySelector(`.btn-crear-riesgo[data-subcat-id="${subcatId}"]`);
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;

        try {
            const nuevoNivel = await this.riesgoNivelManager.crearNivel({ nombre, color }, this.usuarioActual);
            this.nivelesRiesgo.push(nuevoNivel);
            subcat.riesgoNivelId = nuevoNivel.id;
            this._renderizarSubcategorias();
            this._mostrarNotificacion(`Nivel "${nombre}" creado y asignado`, 'success');
        } catch (error) {
            this._mostrarError(error.message || 'Error al crear el nivel');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    // ========== VALIDACIÓN Y GUARDADO ==========
    _validarYGuardar() {
        const nombre = document.getElementById('nombreCategoria').value.trim();
        if (!nombre) return this._mostrarError('El nombre de la categoría es obligatorio');
        if (nombre.length < 3) return this._mostrarError('El nombre debe tener al menos 3 caracteres');
        if (nombre.length > LIMITES.NOMBRE_CATEGORIA) return this._mostrarError(`Máximo ${LIMITES.NOMBRE_CATEGORIA} caracteres`);

        const descripcion = document.getElementById('descripcionCategoria').value.trim();
        if (descripcion.length > LIMITES.DESCRIPCION_CATEGORIA) return this._mostrarError(`Descripción excede ${LIMITES.DESCRIPCION_CATEGORIA} caracteres`);

        const subcatsValidas = this.subcategorias.filter(s => s.nombre.trim() !== '');
        if (this.subcategorias.length > 0 && subcatsValidas.length === 0) return this._mostrarError('Las subcategorías deben tener nombre');

        const nombres = subcatsValidas.map(s => s.nombre.trim().toLowerCase());
        if (new Set(nombres).size !== nombres.length) return this._mostrarError('No pueden haber subcategorías con el mismo nombre');

        const datos = this._obtenerDatosFormulario(subcatsValidas);
        this._guardarCategoria(datos);
    }

    _obtenerDatosFormulario(subcatsValidas) {
        const colorCategoria = document.getElementById('colorPickerNative').value;
        const subcategorias = {};
        subcatsValidas.forEach(subcat => {
            const id = subcat.id.startsWith('temp_') ? `sub_${Date.now()}_${Math.random().toString(36).substr(2, 4)}` : subcat.id;
            let colorFinal;
            if (subcat.heredaColor) {
                colorFinal = this._calcularColorEfectivo(subcat, colorCategoria);
            } else {
                colorFinal = subcat.colorPersonalizado || colorCategoria;
            }
            subcategorias[id] = {
                id: id,
                nombre: subcat.nombre.trim(),
                descripcion: subcat.descripcion?.trim() || '',
                heredaColor: subcat.heredaColor,
                color: colorFinal,
                brightnessFactor: subcat.heredaColor ? subcat.brightnessFactor : null,
                riesgoNivelId: (subcat.riesgoNivelId && subcat.riesgoNivelId !== '__otro__') ? subcat.riesgoNivelId : null
            };
        });
        return {
            nombre: document.getElementById('nombreCategoria').value.trim(),
            descripcion: document.getElementById('descripcionCategoria').value.trim(),
            color: colorCategoria,
            subcategorias: subcategorias,
            organizacionCamelCase: this.usuarioActual.organizacionCamelCase
        };
    }

    async _guardarCategoria(datos) {
        const btn = document.getElementById('btnCrearCategoria');
        const original = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
        btn.disabled = true;

        try {
            const existe = await this.categoriaManager.verificarCategoriaExistente(datos.nombre, this.usuarioActual.organizacionCamelCase);
            if (existe) throw new Error(`Ya existe una categoría con el nombre "${datos.nombre}"`);

            const nuevaCategoria = await this.categoriaManager.crearCategoria(datos, this.usuarioActual);
            await Swal.fire({
                icon: 'success',
                title: '¡Categoría creada!',
                text: `La categoría "${nuevaCategoria.nombre}" se guardó correctamente.`,
                confirmButtonText: 'Ver categorías'
            });
            this._volverALista();
        } catch (error) {
            this._mostrarError(error.message);
        } finally {
            btn.innerHTML = original;
            btn.disabled = false;
        }
    }

    _volverALista() {
        window.location.href = '../categorias/categorias.html';
    }

    _cancelarCreacion() {
        Swal.fire({
            title: '¿Cancelar?',
            text: 'Los cambios no guardados se perderán',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, cancelar'
        }).then(result => {
            if (result.isConfirmed) this._volverALista();
        });
    }

    _mostrarError(mensaje) {
        Swal.fire({ icon: 'error', title: 'Error', text: mensaje });
    }

    _mostrarNotificacion(mensaje, tipo = 'info') {
        Swal.fire({ icon: tipo, title: tipo === 'success' ? 'Éxito' : 'Información', text: mensaje, timer: 2000, showConfirmButton: false });
    }

    _escapeHTML(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new CrearCategoriaController();
});