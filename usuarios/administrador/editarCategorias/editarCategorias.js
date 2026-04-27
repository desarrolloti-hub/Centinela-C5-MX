/**
 * EDITAR CATEGORÍAS - CON SLIDER DE BRILLO Y NUEVO LAYOUT
 * Sistema Centinela
 */

import { CategoriaManager } from '/clases/categoria.js';
import { RiesgoNivelManager } from '/clases/riesgoNivel.js';

// =============================================
// VARIABLES GLOBALES
// =============================================
let categoriaManager = null;
let riesgoNivelManager = null;
let categoriaActual = null;
let subcategorias = [];
let empresaActual = null;
let historialManager = null;
let nivelesRiesgo = [];

window.editarCategoriaDebug = {
    estado: 'iniciando',
    controller: null
};

const LIMITES = {
    NOMBRE_CATEGORIA: 50,
    DESCRIPCION_CATEGORIA: 500,
    NOMBRE_SUBCATEGORIA: 50,
    DESCRIPCION_SUBCATEGORIA: 200
};

// =============================================
// INICIALIZACIÓN
// =============================================
async function inicializarCategoriaManager() {
    try {
        obtenerDatosEmpresa();
        await inicializarHistorial();
        const { CategoriaManager } = await import('/clases/categoria.js');
        categoriaManager = new CategoriaManager();
        riesgoNivelManager = new RiesgoNivelManager();
        await cargarNivelesRiesgo();
        return true;
    } catch (error) {
        console.error('❌ Error al cargar módulos:', error);
        Swal.fire({
            title: 'Error crítico',
            html: `<p>No se pudo cargar el módulo: ${error.message}</p>`,
            confirmButtonText: 'Recargar'
        }).then(() => window.location.reload());
        return false;
    }
}

async function cargarNivelesRiesgo() {
    try {
        const usuario = obtenerUsuarioActual();
        if (usuario && usuario.organizacionCamelCase) {
            nivelesRiesgo = await riesgoNivelManager.obtenerTodosNiveles(usuario.organizacionCamelCase);
        } else {
            nivelesRiesgo = [];
        }
    } catch (error) {
        console.error('Error cargando niveles de riesgo:', error);
        nivelesRiesgo = [];
    }
}

async function inicializarHistorial() {
    try {
        const { HistorialUsuarioManager } = await import('/clases/historialUsuario.js');
        historialManager = new HistorialUsuarioManager();
    } catch (error) {
        console.error('Error inicializando historialManager:', error);
    }
}

function obtenerUsuarioActual() {
    try {
        const adminInfo = localStorage.getItem('adminInfo');
        if (adminInfo) {
            const adminData = JSON.parse(adminInfo);
            return {
                id: adminData.id || adminData.uid,
                nombreCompleto: adminData.nombreCompleto || 'Administrador',
                organizacion: adminData.organizacion,
                organizacionCamelCase: adminData.organizacionCamelCase,
                correo: adminData.correoElectronico || ''
            };
        }
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        if (userData && Object.keys(userData).length > 0) {
            return {
                id: userData.uid || userData.id,
                nombreCompleto: userData.nombreCompleto || userData.nombre || 'Usuario',
                organizacion: userData.organizacion || userData.empresa,
                organizacionCamelCase: userData.organizacionCamelCase,
                correo: userData.correo || userData.email || ''
            };
        }
        return null;
    } catch (error) {
        console.error('Error obteniendo usuario actual:', error);
        return null;
    }
}

function obtenerDatosEmpresa() {
    try {
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        empresaActual = {
            id: userData.organizacionCamelCase || userData.organizacion || '',
            nombre: userData.organizacion || 'No especificada',
            camelCase: userData.organizacionCamelCase || ''
        };
    } catch (error) {
        console.error('Error obteniendo datos de empresa:', error);
        empresaActual = { id: '', nombre: 'No especificada', camelCase: '' };
    }
}

document.addEventListener('DOMContentLoaded', async function () {
    const exito = await inicializarCategoriaManager();
    if (!exito) return;

    const urlParams = new URLSearchParams(window.location.search);
    const categoriaId = urlParams.get('id');

    if (!categoriaId) {
        mostrarNotificacion('No se especificó la categoría a editar', 'error');
        setTimeout(() => window.location.href = '../categorias/categorias.html', 2000);
        return;
    }

    await cargarCategoria(categoriaId);
    inicializarComponentes();
    inicializarEventos();
    window.editarCategoriaDebug.controller = {
        eliminarSubcategoria,
        actualizarSubcategoria,
        cambiarHerenciaColor,
        actualizarColorPersonalizado,
        renderizarSubcategorias,
        cambiarRiesgoSeleccionado,
        crearNuevoRiesgoYAsignar,
        actualizarBrightnessFactor
    };

    if (urlParams.get('nuevaSubcategoria') === 'true') {
        setTimeout(() => {
            agregarSubcategoria();
            setTimeout(() => {
                const container = document.getElementById('subcategoriasList');
                if (container) container.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 200);
            mostrarNotificacion('➕ Creando nueva subcategoría', 'info');
        }, 500);
    }

    const editarSubcategoriaId = urlParams.get('editarSubcategoria');
    if (editarSubcategoriaId) {
        setTimeout(() => {
            const subElement = document.getElementById(`subcategoria_${editarSubcategoriaId}`);
            if (subElement) {
                subElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                subElement.style.transition = 'var(--transition-default)';
                subElement.style.boxShadow = '0 0 0 4px var(--color-accent-primary)';
                setTimeout(() => subElement.style.boxShadow = 'var(--shadow-normal)', 1500);
            }
        }, 600);
    }
});

async function cargarCategoria(id) {
    if (!categoriaManager) {
        mostrarNotificacion('Error: Sistema no inicializado', 'error');
        return;
    }

    try {
        categoriaActual = await categoriaManager.obtenerCategoriaPorId(id);
        if (!categoriaActual) {
            mostrarNotificacion('Categoría no encontrada', 'error');
            setTimeout(() => window.location.href = '../categorias/categorias.html', 2000);
            return;
        }

        window.categoriaOriginal = JSON.parse(JSON.stringify(categoriaActual));
        subcategorias = [];

        if (categoriaActual.subcategorias && typeof categoriaActual.subcategorias === 'object') {
            Object.keys(categoriaActual.subcategorias).forEach(key => {
                const sub = categoriaActual.subcategorias[key];
                if (sub && typeof sub === 'object') {
                    subcategorias.push({
                        id: key,
                        nombre: sub.nombre || '',
                        descripcion: sub.descripcion || '',
                        fechaCreacion: sub.fechaCreacion || new Date().toISOString(),
                        fechaActualizacion: sub.fechaActualizacion || new Date().toISOString(),
                        heredaColor: sub.heredaColor !== undefined ? sub.heredaColor : true,
                        colorPersonalizado: sub.color || '#ff5733',
                        brightnessFactor: sub.brightnessFactor !== undefined ? sub.brightnessFactor : 1.0,
                        riesgoNivelId: sub.riesgoNivelId || null
                    });
                }
            });
        }

        actualizarUICategoria();
        renderizarSubcategorias();
    } catch (error) {
        console.error('Error al cargar categoría:', error);
        mostrarNotificacion('Error al cargar la categoría', 'error');
    }
}

function actualizarUICategoria() {
    if (!categoriaActual) return;
    const headerTitle = document.getElementById('categoriaNombreHeader');
    if (headerTitle) headerTitle.textContent = categoriaActual.nombre || 'Categoría';
    document.getElementById('nombreCategoria').value = categoriaActual.nombre || '';
    document.getElementById('descripcionCategoria').value = categoriaActual.descripcion || '';
    const colorPicker = document.getElementById('colorPickerNative');
    if (colorPicker) colorPicker.value = categoriaActual.color || '#2f8cff';
    const colorDisplay = document.getElementById('colorDisplay');
    if (colorDisplay) colorDisplay.style.backgroundColor = categoriaActual.color || '#2f8cff';
    const colorHex = document.getElementById('colorHex');
    if (colorHex) colorHex.textContent = categoriaActual.color || '#2f8cff';
    actualizarContadorCaracteres();
}

function actualizarContadorCaracteres() {
    const descripcion = document.getElementById('descripcionCategoria');
    const contador = document.getElementById('contadorCaracteres');
    if (descripcion && contador) {
        const longitud = descripcion.value.length;
        contador.textContent = `${longitud}/${LIMITES.DESCRIPCION_CATEGORIA}`;
        contador.style.color = longitud > LIMITES.DESCRIPCION_CATEGORIA * 0.9 ? 'var(--color-warning)' : 'var(--color-accent-primary)';
    }
}

// =============================================
// GESTIÓN DE SUBCATEGORÍAS
// =============================================
function agregarSubcategoria() {
    const subcatId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    subcategorias.push({
        id: subcatId,
        nombre: '',
        descripcion: '',
        heredaColor: true,
        colorPersonalizado: '#ff5733',
        brightnessFactor: 1.0,
        riesgoNivelId: '',
        esNuevo: true
    });
    renderizarSubcategorias();
    setTimeout(() => {
        const input = document.getElementById(`subcat_nombre_${subcatId}`);
        if (input) input.focus();
    }, 100);
}

function eliminarSubcategoria(subcatId) {
    Swal.fire({
        title: '¿Eliminar subcategoría?',
        text: 'Esta acción no se puede deshacer',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar'
    }).then((result) => {
        if (result.isConfirmed) {
            subcategorias = subcategorias.filter(s => s.id !== subcatId);
            renderizarSubcategorias();
            mostrarNotificacion('Subcategoría eliminada', 'success');
        }
    });
}

function actualizarSubcategoria(subcatId, campo, valor) {
    const subcat = subcategorias.find(s => s.id === subcatId);
    if (subcat) {
        if (campo === 'nombre' && valor.length > LIMITES.NOMBRE_SUBCATEGORIA) {
            valor = valor.substring(0, LIMITES.NOMBRE_SUBCATEGORIA);
            mostrarNotificacion(`El nombre no puede exceder ${LIMITES.NOMBRE_SUBCATEGORIA} caracteres`, 'warning', 3000);
        }
        if (campo === 'descripcion' && valor.length > LIMITES.DESCRIPCION_SUBCATEGORIA) {
            valor = valor.substring(0, LIMITES.DESCRIPCION_SUBCATEGORIA);
            mostrarNotificacion(`La descripción no puede exceder ${LIMITES.DESCRIPCION_SUBCATEGORIA} caracteres`, 'warning', 3000);
        }
        subcat[campo] = valor;
        // Actualizar contador visual
        const input = document.getElementById(`subcat_${campo}_${subcatId}`);
        if (input) {
            const parent = input.closest('.subcategoria-campo') || input.closest('.subcategoria-campo-full');
            const counter = parent?.querySelector('.char-counter');
            if (counter) {
                const limite = campo === 'nombre' ? LIMITES.NOMBRE_SUBCATEGORIA : LIMITES.DESCRIPCION_SUBCATEGORIA;
                counter.textContent = `${valor.length}/${limite}`;
            }
        }
    }
}

function cambiarHerenciaColor(subcatId, hereda) {
    const subcat = subcategorias.find(s => s.id === subcatId);
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
        renderizarSubcategorias();
    }
}

function actualizarColorPersonalizado(subcatId, color) {
    const subcat = subcategorias.find(s => s.id === subcatId);
    if (subcat && !subcat.heredaColor) {
        subcat.colorPersonalizado = color;
        renderizarSubcategorias();
    }
}

// ========== FUNCIONES DE COLOR ==========
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function adjustBrightness(rgb, factor) {
    let r = Math.min(255, Math.max(0, Math.round(rgb.r * factor)));
    let g = Math.min(255, Math.max(0, Math.round(rgb.g * factor)));
    let b = Math.min(255, Math.max(0, Math.round(rgb.b * factor)));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function calcularColorEfectivo(subcat, colorCategoria) {
    if (!subcat.heredaColor) {
        return subcat.colorPersonalizado || colorCategoria;
    }
    const rgb = hexToRgb(colorCategoria);
    if (!rgb) return colorCategoria;
    let factor = subcat.brightnessFactor;
    factor = Math.min(1.5, Math.max(0.5, factor));
    return adjustBrightness(rgb, factor);
}

// Actualiza solo la vista previa del color sin re-renderizar toda la subcategoría
function actualizarVistaPreviaColorSubcategoria(subcatId) {
    const subcat = subcategorias.find(s => s.id === subcatId);
    if (!subcat) return;
    const colorCategoria = document.getElementById('colorPickerNative')?.value || '#2f8cff';
    const colorEfectivo = calcularColorEfectivo(subcat, colorCategoria);
    
    const itemDiv = document.getElementById(`subcategoria_${subcatId}`);
    if (itemDiv) {
        itemDiv.style.borderLeftColor = colorEfectivo;
        const badge = itemDiv.querySelector('.color-badge');
        if (badge) badge.style.backgroundColor = colorEfectivo;
        const muestra = itemDiv.querySelector('.color-muestra');
        if (muestra) muestra.style.backgroundColor = colorEfectivo;
        const hexSpan = itemDiv.querySelector('.color-actual span:last-child');
        if (hexSpan) hexSpan.textContent = colorEfectivo;
        const hexMini = itemDiv.querySelector('.color-hex-mini');
        if (hexMini) hexMini.textContent = colorEfectivo;
        const percentSpan = itemDiv.querySelector('.tonalidad-valor');
        if (percentSpan) {
            const percent = Math.round((subcat.brightnessFactor - 0.5) * 100);
            percentSpan.textContent = `${percent}%`;
        }
    }
}

function actualizarBrightnessFactor(subcatId, percentValue) {
    const subcat = subcategorias.find(s => s.id === subcatId);
    if (subcat && subcat.heredaColor) {
        const factor = 0.5 + (percentValue / 100);
        subcat.brightnessFactor = Math.min(1.5, Math.max(0.5, factor));
        actualizarVistaPreviaColorSubcategoria(subcatId);
    }
}

// ========== FUNCIONES PARA NIVEL DE RIESGO ==========
function cambiarRiesgoSeleccionado(subcatId, valor) {
    const subcat = subcategorias.find(s => s.id === subcatId);
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

async function crearNuevoRiesgoYAsignar(subcatId) {
    const subcat = subcategorias.find(s => s.id === subcatId);
    if (!subcat) return;
    const nombreInput = document.getElementById(`nuevoRiesgoNombre_${subcatId}`);
    const colorInput = document.getElementById(`nuevoRiesgoColor_${subcatId}`);
    const nombre = nombreInput?.value.trim();
    const color = colorInput?.value || '#2f8cff';
    if (!nombre) {
        mostrarNotificacion('Debes escribir un nombre para el nuevo nivel de riesgo', 'warning');
        return;
    }
    const btn = document.querySelector(`.btn-crear-riesgo[data-subcat-id="${subcatId}"]`);
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;
    try {
        const usuario = obtenerUsuarioActual();
        const nuevoNivel = await riesgoNivelManager.crearNivel({ nombre, color }, usuario);
        nivelesRiesgo.push(nuevoNivel);
        subcat.riesgoNivelId = nuevoNivel.id;
        renderizarSubcategorias();
        mostrarNotificacion(`Nivel "${nombre}" creado y asignado`, 'success');
    } catch (error) {
        console.error(error);
        mostrarNotificacion(error.message || 'Error al crear el nivel', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ========== RENDERIZADO PRINCIPAL (NUEVO LAYOUT) ==========
function renderizarSubcategorias() {
    const container = document.getElementById('subcategoriasList');
    if (!container) return;

    if (subcategorias.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-sitemap"></i>
                <p>No hay subcategorías agregadas</p>
                <small>Haga clic en "Agregar Subcategoría" para añadir una</small>
            </div>
        `;
        return;
    }

    const colorCategoria = document.getElementById('colorPickerNative')?.value || '#2f8cff';
    let html = '';

    subcategorias.forEach((subcat, index) => {
        const colorEfectivo = calcularColorEfectivo(subcat, colorCategoria);
        const sliderValue = subcat.heredaColor ? Math.round((subcat.brightnessFactor - 0.5) * 100) : 50;
        
        // Gradiente para el slider
        const rgbBase = hexToRgb(colorCategoria);
        const darkColor = rgbBase ? adjustBrightness(rgbBase, 0.5) : '#2f8cff';
        const lightColor = rgbBase ? adjustBrightness(rgbBase, 1.5) : '#2f8cff';
        const sliderGradient = `linear-gradient(90deg, ${darkColor} 0%, ${colorCategoria} 50%, ${lightColor} 100%)`;

        // Opciones del select de niveles de riesgo
        let riesgoOptions = '<option value="">-- Seleccionar --</option>';
        nivelesRiesgo.forEach(nivel => {
            const selected = (subcat.riesgoNivelId === nivel.id) ? 'selected' : '';
            riesgoOptions += `<option value="${nivel.id}" ${selected}>${escapeHTML(nivel.nombre)} (${nivel.color})</option>`;
        });
        riesgoOptions += '<option value="__otro__" ' + (subcat.riesgoNivelId === '__otro__' ? 'selected' : '') + '>Crear nuevo nivel...</option>';
        const showNuevoRiesgo = (subcat.riesgoNivelId === '__otro__') ? 'block' : 'none';

        html += `
            <div class="subcategoria-item" style="border-left: 4px solid ${colorEfectivo}; transition: border-left-color 0.1s ease;" id="subcategoria_${subcat.id}">
                <div class="subcategoria-header">
                    <div class="subcategoria-titulo">
                        <i class="fas fa-folder"></i> Subcategoría #${index + 1}
                        <span class="color-badge" style="background: ${colorEfectivo}; width:16px; height:16px; border-radius:4px; display:inline-block; margin-left:8px; transition: background 0.1s ease;"></span>
                    </div>
                    <button type="button" class="btn-eliminar-subcategoria" 
                            onclick="window.editarCategoriaDebug.controller.eliminarSubcategoria('${subcat.id}')">
                        <i class="fas fa-trash-alt"></i> Eliminar
                    </button>
                </div>
                <!-- Primera fila: Nombre + Nivel de Riesgo -->
                <div class="subcategoria-row-2cols">
                    <div class="subcategoria-campo">
                        <label><i class="fas fa-tag"></i> Nombre *</label>
                        <input type="text" class="subcategoria-input" id="subcat_nombre_${subcat.id}"
                            value="${escapeHTML(subcat.nombre)}" maxlength="${LIMITES.NOMBRE_SUBCATEGORIA}"
                            oninput="window.editarCategoriaDebug.controller.actualizarSubcategoria('${subcat.id}', 'nombre', this.value)">
                        <div class="char-limit-info"><span class="char-counter">${subcat.nombre.length}/${LIMITES.NOMBRE_SUBCATEGORIA}</span></div>
                    </div>
                    <div class="subcategoria-campo">
                        <label><i class="fas fa-chart-line"></i> Nivel de Riesgo</label>
                        <div class="riesgo-select-wrapper">
                            <select class="subcategoria-select-riesgo" data-subcat-id="${subcat.id}"
                                onchange="window.editarCategoriaDebug.controller.cambiarRiesgoSeleccionado('${subcat.id}', this.value)">
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
                        value="${escapeHTML(subcat.descripcion)}" maxlength="${LIMITES.DESCRIPCION_SUBCATEGORIA}"
                        oninput="window.editarCategoriaDebug.controller.actualizarSubcategoria('${subcat.id}', 'descripcion', this.value)">
                    <div class="char-limit-info"><span class="char-counter">${subcat.descripcion.length}/${LIMITES.DESCRIPCION_SUBCATEGORIA}</span></div>
                </div>
                <!-- Tercera fila: controles de color -->
                <div class="subcategoria-color-control">
                    <div class="herencia-color">
                        <label class="herencia-checkbox">
                            <input type="checkbox" ${subcat.heredaColor ? 'checked' : ''}
                                onchange="window.editarCategoriaDebug.controller.cambiarHerenciaColor('${subcat.id}', this.checked)">
                            <span> Heredar color de categoría</span>
                        </label>
                    </div>
                    ${subcat.heredaColor ? `
                    <div class="tonalidad-control">
                        <span class="tonalidad-label"><i class="fas fa-adjust"></i> Brillo:</span>
                        <input type="range" class="tonalidad-slider" min="0" max="100" value="${sliderValue}"
                            style="background: ${sliderGradient};"
                            oninput="window.editarCategoriaDebug.controller.actualizarBrightnessFactor('${subcat.id}', this.value)">
                        <span class="tonalidad-valor">${sliderValue}%</span>
                        <span class="color-hex-mini">${colorEfectivo}</span>
                    </div>
                    ` : `
                    <div class="color-personalizado">
                        <span><i class="fas fa-palette"></i> Color:</span>
                        <input type="color" class="color-personalizado-input" id="subcat_color_${subcat.id}"
                            value="${subcat.colorPersonalizado || '#ff5733'}"
                            onchange="window.editarCategoriaDebug.controller.actualizarColorPersonalizado('${subcat.id}', this.value);
                                     window.editarCategoriaDebug.controller.renderizarSubcategorias();">
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
        btn.removeEventListener('click', window._tmpHandler);
        const handler = async () => {
            const sid = btn.dataset.subcatId;
            await crearNuevoRiesgoYAsignar(sid);
        };
        btn.addEventListener('click', handler);
        btn._tmpHandler = handler;
    });
}

// =============================================
// VALIDACIÓN Y GUARDADO
// =============================================
function validarYGuardar() {
    const nombreInput = document.getElementById('nombreCategoria');
    const nombre = nombreInput.value.trim();
    if (!nombre) {
        nombreInput.classList.add('is-invalid');
        mostrarError('El nombre de la categoría es obligatorio');
        return;
    }
    if (nombre.length < 3) {
        nombreInput.classList.add('is-invalid');
        mostrarError('El nombre debe tener al menos 3 caracteres');
        return;
    }
    if (nombre.length > LIMITES.NOMBRE_CATEGORIA) {
        nombreInput.classList.add('is-invalid');
        mostrarError(`El nombre no puede exceder ${LIMITES.NOMBRE_CATEGORIA} caracteres`);
        return;
    }
    nombreInput.classList.remove('is-invalid');

    const descripcionInput = document.getElementById('descripcionCategoria');
    const descripcion = descripcionInput.value.trim();
    if (descripcion.length > LIMITES.DESCRIPCION_CATEGORIA) {
        descripcionInput.classList.add('is-invalid');
        mostrarError(`La descripción no puede exceder ${LIMITES.DESCRIPCION_CATEGORIA} caracteres`);
        return;
    }
    descripcionInput.classList.remove('is-invalid');

    const subcatsValidas = subcategorias.filter(s => s.nombre && s.nombre.trim() !== '');
    if (subcategorias.length > 0 && subcatsValidas.length === 0) {
        mostrarError('Las subcategorías agregadas deben tener nombre');
        return;
    }

    const nombres = subcatsValidas.map(s => s.nombre.trim().toLowerCase());
    if (new Set(nombres).size !== nombres.length) {
        mostrarError('No puede haber subcategorías con el mismo nombre');
        return;
    }

    for (const subcat of subcatsValidas) {
        if (subcat.nombre && subcat.nombre.length > LIMITES.NOMBRE_SUBCATEGORIA) {
            mostrarError(`El nombre de la subcategoría no puede exceder ${LIMITES.NOMBRE_SUBCATEGORIA} caracteres`);
            return;
        }
        if (subcat.descripcion && subcat.descripcion.length > LIMITES.DESCRIPCION_SUBCATEGORIA) {
            mostrarError(`La descripción de la subcategoría no puede exceder ${LIMITES.DESCRIPCION_SUBCATEGORIA} caracteres`);
            return;
        }
    }

    const datos = obtenerDatosFormulario(subcatsValidas);
    guardarCategoria(datos);
}

function obtenerDatosFormulario(subcatsValidas) {
    const nombre = document.getElementById('nombreCategoria').value.trim();
    const descripcion = document.getElementById('descripcionCategoria').value.trim();
    const colorCategoria = document.getElementById('colorPickerNative')?.value || '#2f8cff';

    const subcategoriasObj = {};
    subcatsValidas.forEach(subcat => {
        const id = subcat.id.startsWith('temp_') ? `sub_${Date.now()}_${Math.random().toString(36).substr(2, 4)}` : subcat.id;
        let colorFinal;
        if (subcat.heredaColor) {
            colorFinal = calcularColorEfectivo(subcat, colorCategoria);
        } else {
            colorFinal = subcat.colorPersonalizado || colorCategoria;
        }
        subcategoriasObj[id] = {
            id: id,
            nombre: subcat.nombre.trim(),
            descripcion: subcat.descripcion?.trim() || '',
            fechaCreacion: subcat.fechaCreacion || new Date().toISOString(),
            fechaActualizacion: new Date().toISOString(),
            heredaColor: subcat.heredaColor !== undefined ? subcat.heredaColor : true,
            color: colorFinal,
            brightnessFactor: subcat.heredaColor ? subcat.brightnessFactor : null,
            riesgoNivelId: (subcat.riesgoNivelId && subcat.riesgoNivelId !== '__otro__') ? subcat.riesgoNivelId : null
        };
    });

    return {
        id: categoriaActual.id,
        nombre: nombre,
        descripcion: descripcion,
        color: colorCategoria,
        subcategorias: subcategoriasObj,
        organizacionCamelCase: categoriaActual.organizacionCamelCase || empresaActual.camelCase,
        organizacionNombre: categoriaActual.organizacionNombre || empresaActual.nombre
    };
}

async function guardarCategoria(datos) {
    const btnGuardar = document.getElementById('btnGuardarCategoria');
    const originalHTML = btnGuardar.innerHTML;
    try {
        if (btnGuardar) {
            btnGuardar.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Guardando...';
            btnGuardar.disabled = true;
        }

        const categoriaActualizada = {
            id: datos.id,
            nombre: datos.nombre,
            descripcion: datos.descripcion,
            color: datos.color,
            subcategorias: datos.subcategorias
        };

        await categoriaManager.actualizarCategoria(datos.id, {
            nombre: datos.nombre,
            descripcion: datos.descripcion,
            color: datos.color,
            subcategorias: datos.subcategorias
        });

        if (window.categoriaOriginal) {
            await registrarEdicionCategoria(window.categoriaOriginal, categoriaActualizada);
        }

        await Swal.fire({
            icon: 'success',
            title: '¡Categoría actualizada!',
            text: 'La categoría se ha guardado correctamente.',
            confirmButtonText: 'Ver categorías'
        });
        window.location.href = '../categorias/categorias.html';
    } catch (error) {
        console.error('Error guardando categoría:', error);
        mostrarError(error.message || 'No se pudo actualizar la categoría');
    } finally {
        if (btnGuardar) {
            btnGuardar.innerHTML = originalHTML;
            btnGuardar.disabled = false;
        }
    }
}

async function registrarEdicionCategoria(categoriaOriginal, categoriaActualizada) {
    if (!historialManager) return;
    const usuario = obtenerUsuarioActual();
    if (!usuario) return;
    const cambios = [];
    if (categoriaOriginal.nombre !== categoriaActualizada.nombre) cambios.push({ campo: 'nombre', anterior: categoriaOriginal.nombre, nuevo: categoriaActualizada.nombre });
    if (categoriaOriginal.descripcion !== categoriaActualizada.descripcion) cambios.push({ campo: 'descripcion', anterior: categoriaOriginal.descripcion?.substring(0,50), nuevo: categoriaActualizada.descripcion?.substring(0,50) });
    if (categoriaOriginal.color !== categoriaActualizada.color) cambios.push({ campo: 'color', anterior: categoriaOriginal.color, nuevo: categoriaActualizada.color });
    const cambiosSubcategorias = detectarCambiosSubcategorias(categoriaOriginal.subcategorias, categoriaActualizada.subcategorias);
    await historialManager.registrarActividad({
        usuario: usuario,
        tipo: 'editar',
        modulo: 'categorias',
        descripcion: `Editó categoría: ${categoriaActualizada.nombre}`,
        detalles: { categoriaId: categoriaActualizada.id, categoriaNombre: categoriaActualizada.nombre, cambios, cambiosSubcategorias }
    });
}

function detectarCambiosSubcategorias(originales, actualizadas) {
    const cambios = { agregadas: [], eliminadas: [], modificadas: [] };
    const originalArray = [];
    const actualArray = [];
    if (originales && typeof originales === 'object') {
        Object.keys(originales).forEach(key => { if (originales[key] && typeof originales[key] === 'object') originalArray.push({ id: key, ...originales[key] }); });
    }
    if (actualizadas && typeof actualizadas === 'object') {
        Object.keys(actualizadas).forEach(key => { if (actualizadas[key] && typeof actualizadas[key] === 'object') actualArray.push({ id: key, ...actualizadas[key] }); });
    }
    actualArray.forEach(actual => {
        const existe = originalArray.some(orig => orig.id === actual.id);
        if (!existe && actual.nombre) cambios.agregadas.push({ id: actual.id, nombre: actual.nombre, descripcion: actual.descripcion?.substring(0,50) });
    });
    originalArray.forEach(original => {
        const existe = actualArray.some(actual => actual.id === original.id);
        if (!existe && original.nombre) cambios.eliminadas.push({ id: original.id, nombre: original.nombre });
    });
    actualArray.forEach(actual => {
        const original = originalArray.find(orig => orig.id === actual.id);
        if (original && actual.nombre) {
            const cambiosSub = [];
            if (original.nombre !== actual.nombre) cambiosSub.push({ campo: 'nombre', anterior: original.nombre, nuevo: actual.nombre });
            if (original.descripcion !== actual.descripcion) cambiosSub.push({ campo: 'descripcion', anterior: original.descripcion?.substring(0,50), nuevo: actual.descripcion?.substring(0,50) });
            if (original.heredaColor !== actual.heredaColor) cambiosSub.push({ campo: 'heredaColor', anterior: original.heredaColor, nuevo: actual.heredaColor });
            if (!actual.heredaColor && original.color !== actual.color) cambiosSub.push({ campo: 'color', anterior: original.color, nuevo: actual.color });
            if (original.riesgoNivelId !== actual.riesgoNivelId) cambiosSub.push({ campo: 'riesgoNivelId', anterior: original.riesgoNivelId, nuevo: actual.riesgoNivelId });
            if (original.brightnessFactor !== actual.brightnessFactor) cambiosSub.push({ campo: 'brightnessFactor', anterior: original.brightnessFactor, nuevo: actual.brightnessFactor });
            if (cambiosSub.length > 0) cambios.modificadas.push({ id: actual.id, nombre: actual.nombre, cambios: cambiosSub });
        }
    });
    return cambios;
}

// =============================================
// NAVEGACIÓN
// =============================================
function volverALista() { window.location.href = '../categorias/categorias.html'; }
function cancelarEdicion() {
    Swal.fire({
        title: '¿Cancelar?',
        text: 'Los cambios no guardados se perderán',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, cancelar'
    }).then((result) => { if (result.isConfirmed) volverALista(); });
}

// =============================================
// COMPONENTES Y EVENTOS
// =============================================
function inicializarComponentes() {
    const colorPreviewCard = document.getElementById('colorPreviewCard');
    const colorPickerNative = document.getElementById('colorPickerNative');
    if (colorPreviewCard && colorPickerNative) {
        colorPreviewCard.addEventListener('click', () => colorPickerNative.click());
        colorPickerNative.addEventListener('input', (e) => {
            const color = e.target.value;
            document.getElementById('colorDisplay').style.backgroundColor = color;
            document.getElementById('colorHex').textContent = color;
            renderizarSubcategorias();
        });
    }
    const descripcionInput = document.getElementById('descripcionCategoria');
    if (descripcionInput) descripcionInput.addEventListener('input', actualizarContadorCaracteres);
}

function inicializarEventos() {
    document.getElementById('btnVolverLista')?.addEventListener('click', volverALista);
    document.getElementById('btnCancelar')?.addEventListener('click', cancelarEdicion);
    document.getElementById('btnGuardarCategoria')?.addEventListener('click', (e) => { e.preventDefault(); validarYGuardar(); });
    document.getElementById('btnAgregarSubcategoria')?.addEventListener('click', agregarSubcategoria);
}

// =============================================
// UTILIDADES
// =============================================
function mostrarError(mensaje) { mostrarNotificacion(mensaje, 'error'); }
function mostrarNotificacion(mensaje, tipo = 'info', duracion = 5000) {
    Swal.fire({
        title: tipo === 'success' ? 'Éxito' : tipo === 'error' ? 'Error' : tipo === 'warning' ? 'Advertencia' : 'Información',
        text: mensaje,
        icon: tipo,
        timer: duracion,
        timerProgressBar: true,
        showConfirmButton: false
    });
}
function escapeHTML(text) {
    if (!text) return '';
    return String(text).replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}