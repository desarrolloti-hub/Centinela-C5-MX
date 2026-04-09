/**
 * EDITAR CATEGORÍAS - Sistema Centinela
 * VERSIÓN CORREGIDA - IDÉNTICO A CREAR CATEGORÍAS
 * CON REGISTRO DE BITÁCORA
 */

// =============================================
// VARIABLES GLOBALES
// =============================================
let categoriaManager = null;
let categoriaActual = null;
let subcategorias = [];
let empresaActual = null;
let historialManager = null; // ✅ NUEVO: Para registrar actividades

// Variable global para debugging
window.editarCategoriaDebug = {
    estado: 'iniciando',
    controller: null
};

// LÍMITES DE CARACTERES
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

        // ✅ NUEVO: Inicializar historialManager
        await inicializarHistorial();

        const { CategoriaManager } = await import('/clases/categoria.js');
        categoriaManager = new CategoriaManager();

        return true;
    } catch (error) {
        console.error('❌ Error al cargar CategoriaManager:', error);

        Swal.fire({
            title: 'Error crítico',
            html: `
                <div style="text-align: left;">
                    <p style="margin-bottom: 15px;">No se pudo cargar el módulo de categorías.</p>
                    <div style="background: rgba(239, 68, 68, 0.1); padding: 12px; border-radius: 8px; border-left: 4px solid #ef4444;">
                        <p style="margin: 0; color: #ef4444; font-size: 0.9em;">
                            <i class="fas fa-exclamation-triangle"></i> 
                            <strong>Error:</strong> ${error.message || 'Error desconocido'}
                        </p>
                    </div>
                </div>
            `,
            confirmButtonText: 'Recargar'
        }).then(() => {
            window.location.reload();
        });

        return false;
    }
}

// ✅ NUEVO: Inicializar historialManager
async function inicializarHistorial() {
    try {
        const { HistorialUsuarioManager } = await import('/clases/historialUsuario.js');
        historialManager = new HistorialUsuarioManager();

    } catch (error) {
        console.error('Error inicializando historialManager:', error);
    }
}

// ✅ NUEVO: Obtener usuario actual
function obtenerUsuarioActual() {
    try {
        const adminInfo = localStorage.getItem('adminInfo');
        if (adminInfo) {
            const adminData = JSON.parse(adminInfo);
            return {
                id: adminData.id || adminData.uid,
                uid: adminData.uid || adminData.id,
                nombreCompleto: adminData.nombreCompleto || 'Administrador',
                organizacion: adminData.organizacion,
                organizacionCamelCase: adminData.organizacionCamelCase,
                correo: adminData.correoElectronico || '',
                email: adminData.correoElectronico || ''
            };
        }

        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        if (userData && Object.keys(userData).length > 0) {
            return {
                id: userData.uid || userData.id,
                uid: userData.uid || userData.id,
                nombreCompleto: userData.nombreCompleto || userData.nombre || 'Usuario',
                organizacion: userData.organizacion || userData.empresa,
                organizacionCamelCase: userData.organizacionCamelCase,
                correo: userData.correo || userData.email || '',
                email: userData.correo || userData.email || ''
            };
        }

        return null;
    } catch (error) {
        console.error('Error obteniendo usuario actual:', error);
        return null;
    }
}

// ✅ NUEVO: Registrar edición de categoría
async function registrarEdicionCategoria(categoriaOriginal, categoriaActualizada) {
    if (!historialManager) return;

    try {
        const usuario = obtenerUsuarioActual();
        if (!usuario) return;

        // Detectar cambios
        const cambios = [];

        if (categoriaOriginal.nombre !== categoriaActualizada.nombre) {
            cambios.push({
                campo: 'nombre',
                anterior: categoriaOriginal.nombre,
                nuevo: categoriaActualizada.nombre
            });
        }

        if (categoriaOriginal.descripcion !== categoriaActualizada.descripcion) {
            cambios.push({
                campo: 'descripcion',
                anterior: categoriaOriginal.descripcion?.substring(0, 50) + (categoriaOriginal.descripcion?.length > 50 ? '...' : ''),
                nuevo: categoriaActualizada.descripcion?.substring(0, 50) + (categoriaActualizada.descripcion?.length > 50 ? '...' : '')
            });
        }

        if (categoriaOriginal.color !== categoriaActualizada.color) {
            cambios.push({
                campo: 'color',
                anterior: categoriaOriginal.color,
                nuevo: categoriaActualizada.color
            });
        }

        // Detectar cambios en subcategorías
        const cambiosSubcategorias = detectarCambiosSubcategorias(categoriaOriginal.subcategorias, categoriaActualizada.subcategorias);

        await historialManager.registrarActividad({
            usuario: usuario,
            tipo: 'editar',
            modulo: 'categorias',
            descripcion: `Editó categoría: ${categoriaActualizada.nombre}`,
            detalles: {
                categoriaId: categoriaActualizada.id,
                categoriaNombre: categoriaActualizada.nombre,
                cambios: cambios,
                cambiosSubcategorias: cambiosSubcategorias,
                fechaEdicion: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error registrando edición de categoría:', error);
    }
}

// ✅ NUEVO: Detectar cambios en subcategorías
function detectarCambiosSubcategorias(originales, actualizadas) {
    const cambios = {
        agregadas: [],
        eliminadas: [],
        modificadas: []
    };

    // Convertir a arrays para comparar
    const originalArray = [];
    const actualArray = [];

    if (originales && typeof originales === 'object') {
        Object.keys(originales).forEach(key => {
            if (originales[key] && typeof originales[key] === 'object') {
                originalArray.push({
                    id: key,
                    ...originales[key]
                });
            }
        });
    }

    if (actualizadas && typeof actualizadas === 'object') {
        Object.keys(actualizadas).forEach(key => {
            if (actualizadas[key] && typeof actualizadas[key] === 'object') {
                actualArray.push({
                    id: key,
                    ...actualizadas[key]
                });
            }
        });
    }

    // Detectar agregadas
    actualArray.forEach(actual => {
        const existe = originalArray.some(orig => orig.id === actual.id);
        if (!existe && actual.nombre) {
            cambios.agregadas.push({
                id: actual.id,
                nombre: actual.nombre,
                descripcion: actual.descripcion?.substring(0, 50) || ''
            });
        }
    });

    // Detectar eliminadas
    originalArray.forEach(original => {
        const existe = actualArray.some(actual => actual.id === original.id);
        if (!existe && original.nombre) {
            cambios.eliminadas.push({
                id: original.id,
                nombre: original.nombre
            });
        }
    });

    // Detectar modificadas
    actualArray.forEach(actual => {
        const original = originalArray.find(orig => orig.id === actual.id);
        if (original && actual.nombre) {
            const cambiosSub = [];

            if (original.nombre !== actual.nombre) {
                cambiosSub.push({
                    campo: 'nombre',
                    anterior: original.nombre,
                    nuevo: actual.nombre
                });
            }

            if (original.descripcion !== actual.descripcion) {
                cambiosSub.push({
                    campo: 'descripcion',
                    anterior: original.descripcion?.substring(0, 50) || '',
                    nuevo: actual.descripcion?.substring(0, 50) || ''
                });
            }

            if (original.heredaColor !== actual.heredaColor) {
                cambiosSub.push({
                    campo: 'heredaColor',
                    anterior: original.heredaColor,
                    nuevo: actual.heredaColor
                });
            }

            if (!actual.heredaColor && original.color !== actual.color) {
                cambiosSub.push({
                    campo: 'color',
                    anterior: original.color,
                    nuevo: actual.color
                });
            }

            if (cambiosSub.length > 0) {
                cambios.modificadas.push({
                    id: actual.id,
                    nombre: actual.nombre,
                    cambios: cambiosSub
                });
            }
        }
    });

    return cambios;
}

function obtenerDatosEmpresa() {
    try {
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        const organizacionLogo = localStorage.getItem('organizacionLogo');

        empresaActual = {
            id: userData.organizacionCamelCase || userData.organizacion || '',
            nombre: userData.organizacion || 'No especificada',
            camelCase: userData.organizacionCamelCase || '',
            logo: organizacionLogo || userData.fotoOrganizacion || ''
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

    window.editarCategoriaDebug.controller = this;

    // Verificar si viene con parámetro de nueva subcategoría
    const nuevaSubcategoria = urlParams.get('nuevaSubcategoria');
    if (nuevaSubcategoria === 'true') {
        setTimeout(() => {
            agregarSubcategoria();
            setTimeout(() => {
                const container = document.getElementById('subcategoriasList');
                if (container) {
                    container.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 200);
            mostrarNotificacion('➕ Creando nueva subcategoría', 'info');
        }, 500);
    }

    // Verificar si viene con parámetro de editar subcategoría
    const editarSubcategoriaId = urlParams.get('editarSubcategoria');
    if (editarSubcategoriaId) {
        setTimeout(() => {
            const subElement = document.getElementById(`subcategoria_${editarSubcategoriaId}`);
            if (subElement) {
                subElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                subElement.style.transition = 'var(--transition-default)';
                subElement.style.boxShadow = '0 0 0 4px var(--color-accent-primary)';
                setTimeout(() => {
                    subElement.style.boxShadow = 'var(--shadow-normal)';
                }, 1500);
            }
        }, 600);
    }
});

/**
 * CARGA LA CATEGORÍA DESDE FIRESTORE
 */
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

        // ✅ NUEVO: Guardar copia original para comparar cambios
        window.categoriaOriginal = JSON.parse(JSON.stringify(categoriaActual));

        // Convertir objeto de subcategorías a array
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
                        color: sub.color || null,
                        colorPersonalizado: sub.color || '#ff5733'
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

    // Actualizar título en el header de la tarjeta
    const headerTitle = document.getElementById('categoriaNombreHeader');
    if (headerTitle) {
        headerTitle.textContent = categoriaActual.nombre || 'Categoría';
    }

    // Actualizar campos del formulario
    document.getElementById('nombreCategoria').value = categoriaActual.nombre || '';

    // Descripción
    const descripcionInput = document.getElementById('descripcionCategoria');
    if (descripcionInput) {
        descripcionInput.value = categoriaActual.descripcion || '';
    }

    // Actualizar color
    const colorPicker = document.getElementById('colorPickerNative');
    if (colorPicker) {
        colorPicker.value = categoriaActual.color || '#2f8cff';
    }

    // Actualizar previsualización de color
    const colorDisplay = document.getElementById('colorDisplay');
    if (colorDisplay) {
        colorDisplay.style.backgroundColor = categoriaActual.color || '#2f8cff';
    }

    const colorHex = document.getElementById('colorHex');
    if (colorHex) {
        colorHex.textContent = categoriaActual.color || '#2f8cff';
    }

    // Actualizar contador de caracteres
    actualizarContadorCaracteres();
}

function actualizarContadorCaracteres() {
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
        esNuevo: true
    });

    renderizarSubcategorias();

    // Enfocar en el nombre
    setTimeout(() => {
        const input = document.getElementById(`subcat_nombre_${subcatId}`);
        if (input) {
            input.focus();
            input.maxLength = LIMITES.NOMBRE_SUBCATEGORIA;
        }
    }, 100);
}

function eliminarSubcategoria(subcatId) {
    Swal.fire({
        title: '¿Eliminar subcategoría?',
        text: 'Esta acción no se puede deshacer',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    }).then((result) => {
        if (result.isConfirmed) {
            subcategorias = subcategorias.filter(s => s.id !== subcatId);
            renderizarSubcategorias();
            mostrarNotificacion('Subcategoría eliminada', 'success');
        }
    });
}

function actualizarSubcategoria(subcatId, campo, valor) {
    const subcategoria = subcategorias.find(s => s.id === subcatId);
    if (subcategoria) {
        // Validar límites de caracteres
        if (campo === 'nombre' && valor.length > LIMITES.NOMBRE_SUBCATEGORIA) {
            valor = valor.substring(0, LIMITES.NOMBRE_SUBCATEGORIA);
            mostrarNotificacion(`El nombre no puede exceder ${LIMITES.NOMBRE_SUBCATEGORIA} caracteres`, 'warning', 3000);
        }
        if (campo === 'descripcion' && valor.length > LIMITES.DESCRIPCION_SUBCATEGORIA) {
            valor = valor.substring(0, LIMITES.DESCRIPCION_SUBCATEGORIA);
            mostrarNotificacion(`La descripción no puede exceder ${LIMITES.DESCRIPCION_SUBCATEGORIA} caracteres`, 'warning', 3000);
        }
        subcategoria[campo] = valor;
    }
}

function cambiarHerenciaColor(subcatId, heredaColor) {
    const subcategoria = subcategorias.find(s => s.id === subcatId);
    if (subcategoria) {
        subcategoria.heredaColor = heredaColor;
        renderizarSubcategorias();
    }
}

function actualizarColorPersonalizado(subcatId, color) {
    const subcategoria = subcategorias.find(s => s.id === subcatId);
    if (subcategoria) {
        subcategoria.colorPersonalizado = color;
    }
}

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

    let html = '';
    const colorCategoria = document.getElementById('colorPickerNative')?.value || '#2f8cff';

    subcategorias.forEach((subcat, index) => {
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
                            onclick="window.eliminarSubcategoria('${subcat.id}')">
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
                               value="${escapeHTML(subcat.nombre)}"
                               placeholder="Ej: Procesadores, Ventas, Redes"
                               maxlength="${LIMITES.NOMBRE_SUBCATEGORIA}"
                               oninput="window.actualizarSubcategoria('${subcat.id}', 'nombre', this.value)">
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
                               value="${escapeHTML(subcat.descripcion)}"
                               placeholder="Descripción opcional"
                               maxlength="${LIMITES.DESCRIPCION_SUBCATEGORIA}"
                               oninput="window.actualizarSubcategoria('${subcat.id}', 'descripcion', this.value)">
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
                                   onchange="window.cambiarHerenciaColor('${subcat.id}', this.checked)">
                            <span>color de categoría</span>
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
                               onchange="window.actualizarColorPersonalizado('${subcat.id}', this.value);
                                        window.renderizarSubcategorias();">
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

// =============================================
// VALIDACIÓN Y GUARDADO
// =============================================

function validarYGuardar() {
    // Validar nombre
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

    // Validar descripción
    const descripcionInput = document.getElementById('descripcionCategoria');
    const descripcion = descripcionInput.value.trim();

    if (descripcion.length > LIMITES.DESCRIPCION_CATEGORIA) {
        descripcionInput.classList.add('is-invalid');
        mostrarError(`La descripción no puede exceder ${LIMITES.DESCRIPCION_CATEGORIA} caracteres`);
        return;
    }
    descripcionInput.classList.remove('is-invalid');

    // Validar subcategorías
    const subcategoriasValidas = subcategorias.filter(s => s.nombre && s.nombre.trim() !== '');
    if (subcategorias.length > 0 && subcategoriasValidas.length === 0) {
        mostrarError('Las subcategorías agregadas deben tener nombre');
        return;
    }

    // Validar nombres duplicados en subcategorías
    const nombres = subcategoriasValidas.map(s => s.nombre.trim().toLowerCase());
    const duplicados = nombres.filter((nombre, index) => nombres.indexOf(nombre) !== index);
    if (duplicados.length > 0) {
        mostrarError('No puede haber subcategorías con el mismo nombre');
        return;
    }

    // Validar límites de caracteres en subcategorías
    for (const subcat of subcategoriasValidas) {
        if (subcat.nombre && subcat.nombre.length > LIMITES.NOMBRE_SUBCATEGORIA) {
            mostrarError(`El nombre de la subcategoría no puede exceder ${LIMITES.NOMBRE_SUBCATEGORIA} caracteres`, 'warning', 3000);
            return;
        }
        if (subcat.descripcion && subcat.descripcion.length > LIMITES.DESCRIPCION_SUBCATEGORIA) {
            mostrarError(`La descripción de la subcategoría no puede exceder ${LIMITES.DESCRIPCION_SUBCATEGORIA} caracteres`, 'warning', 3000);
            return;
        }
    }

    // Obtener datos
    const datos = obtenerDatosFormulario(subcategoriasValidas);

    // Guardar
    guardarCategoria(datos);
}

function obtenerDatosFormulario(subcategoriasValidas) {
    const nombre = document.getElementById('nombreCategoria').value.trim();
    const descripcion = document.getElementById('descripcionCategoria').value.trim();
    const color = document.getElementById('colorPickerNative')?.value || '#2f8cff';

    // Procesar subcategorías
    const subcategoriasObj = {};

    subcategoriasValidas.forEach(subcat => {
        const id = subcat.id.startsWith('temp_') ? `sub_${Date.now()}_${Math.random().toString(36).substr(2, 4)}` : subcat.id;

        subcategoriasObj[id] = {
            id: id,
            nombre: subcat.nombre.trim(),
            descripcion: subcat.descripcion?.trim() || '',
            fechaCreacion: subcat.fechaCreacion || new Date().toISOString(),
            fechaActualizacion: new Date().toISOString(),
            heredaColor: subcat.heredaColor !== undefined ? subcat.heredaColor : true,
            color: !subcat.heredaColor ? (subcat.colorPersonalizado || null) : null
        };
    });

    return {
        id: categoriaActual.id,
        nombre: nombre,
        descripcion: descripcion,
        color: color,
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

        // ✅ NUEVO: Crear objeto con los datos actualizados para registrar cambios
        const categoriaActualizada = {
            id: datos.id,
            nombre: datos.nombre,
            descripcion: datos.descripcion,
            color: datos.color,
            subcategorias: datos.subcategorias
        };

        // Actualizar categoría
        await categoriaManager.actualizarCategoria(datos.id, {
            nombre: datos.nombre,
            descripcion: datos.descripcion,
            color: datos.color,
            subcategorias: datos.subcategorias
        });

        // ✅ NUEVO: Registrar edición en bitácora
        if (window.categoriaOriginal) {
            await registrarEdicionCategoria(window.categoriaOriginal, categoriaActualizada);
        }

        // Mostrar éxito
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

// =============================================
// NAVEGACIÓN
// =============================================

function volverALista() {
    window.location.href = '../categorias/categorias.html';
}

function cancelarEdicion() {
    Swal.fire({
        title: '¿Cancelar?',
        text: 'Los cambios no guardados se perderán',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, cancelar',
        cancelButtonText: 'No, continuar'
    }).then((result) => {
        if (result.isConfirmed) {
            volverALista();
        }
    });
}

// =============================================
// CONFIGURACIÓN DE EVENTOS
// =============================================

function inicializarComponentes() {
    // Color Preview - IGUAL QUE EN CREAR
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
            renderizarSubcategorias();
        });
    }

    // Contador de caracteres
    const descripcionInput = document.getElementById('descripcionCategoria');
    if (descripcionInput) {
        descripcionInput.addEventListener('input', actualizarContadorCaracteres);
    }
}

function inicializarEventos() {
    // Botón Volver a la lista
    const btnVolverLista = document.getElementById('btnVolverLista');
    if (btnVolverLista) {
        btnVolverLista.addEventListener('click', volverALista);
    }

    // Botón Cancelar
    const btnCancelar = document.getElementById('btnCancelar');
    if (btnCancelar) {
        btnCancelar.addEventListener('click', cancelarEdicion);
    }

    // Botón Guardar Categoría
    const btnGuardarCategoria = document.getElementById('btnGuardarCategoria');
    if (btnGuardarCategoria) {
        btnGuardarCategoria.addEventListener('click', (e) => {
            e.preventDefault();
            validarYGuardar();
        });
    }

    // Botón Agregar Subcategoría
    const btnAgregarSub = document.getElementById('btnAgregarSubcategoria');
    if (btnAgregarSub) {
        btnAgregarSub.addEventListener('click', agregarSubcategoria);
    }
}

// =============================================
// UTILIDADES
// =============================================

function mostrarError(mensaje) {
    mostrarNotificacion(mensaje, 'error');
}

function mostrarNotificacion(mensaje, tipo = 'info', duracion = 5000) {
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

function escapeHTML(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Exponer funciones globales para los onclick
window.eliminarSubcategoria = eliminarSubcategoria;
window.actualizarSubcategoria = actualizarSubcategoria;
window.cambiarHerenciaColor = cambiarHerenciaColor;
window.actualizarColorPersonalizado = actualizarColorPersonalizado;
window.renderizarSubcategorias = renderizarSubcategorias;
window.volverALista = volverALista;