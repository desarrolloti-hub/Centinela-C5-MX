// categoria.js - VERSIÓN COMPLETA CON MÉTODOS PARA RIESGO EN SUBCATEGORÍAS

import { db } from '/config/firebase-config.js';
import {
    collection,
    getDocs,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    doc,
    query,
    where,
    serverTimestamp,
    addDoc
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

import consumo from '/clases/consumoFirebase.js';

class Categoria {
    constructor(id, data) {
        this.id = id;
        this.nombre = data.nombre || '';
        this.descripcion = data.descripcion || '';
        this.color = data.color || '#2f8cff';

        this.fechaCreacion = data.fechaCreacion ? this._convertirFecha(data.fechaCreacion) : new Date();
        this.fechaActualizacion = data.fechaActualizacion ? this._convertirFecha(data.fechaActualizacion) : new Date();

        this.subcategorias = {};

        if (data.subcategorias) {
            if (typeof data.subcategorias === 'object') {
                this.subcategorias = JSON.parse(JSON.stringify(data.subcategorias));
            }
        }

        this.organizacionCamelCase = data.organizacionCamelCase || '';
        this.organizacionNombre = data.organizacionNombre || '';
    }

    _convertirFecha(fecha) {
        if (fecha && typeof fecha.toDate === 'function') return fecha.toDate();
        if (fecha instanceof Date) return fecha;
        if (typeof fecha === 'string' || typeof fecha === 'number') return new Date(fecha);
        return new Date();
    }

    _formatearFecha(date) {
        if (!date) return 'No disponible';
        try {
            const fecha = this._convertirFecha(date);
            return fecha.toLocaleDateString('es-ES', {
                year: 'numeric', month: 'long', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        } catch (e) {
            return 'Fecha inválida';
        }
    }

    // ==================== MÉTODOS PARA NIVEL DE RIESGO EN SUBCATEGORÍAS ====================

    /**
     * Obtiene el nivel de riesgo asignado a una subcategoría
     * @param {string} subcatId - ID de la subcategoría
     * @returns {string|null} - ID del nivel de riesgo o null si no tiene
     */
    obtenerRiesgoDeSubcategoria(subcatId) {
        const subcat = this.subcategorias[subcatId];
        if (!subcat) return null;
        return subcat.riesgoNivelId || null;
    }

    /**
     * Asigna un nivel de riesgo a una subcategoría
     * @param {string} subcatId - ID de la subcategoría
     * @param {string} riesgoId - ID del nivel de riesgo
     * @returns {boolean} - true si se asignó correctamente
     */
    asignarRiesgoASubcategoria(subcatId, riesgoId) {
        if (!this.subcategorias[subcatId]) {
            console.error(`Subcategoría ${subcatId} no encontrada`);
            return false;
        }

        this.subcategorias[subcatId].riesgoNivelId = riesgoId;
        this.subcategorias[subcatId].fechaActualizacion = new Date().toISOString();
        this.fechaActualizacion = new Date();
        return true;
    }

    /**
     * Verifica si una subcategoría tiene nivel de riesgo asignado
     * @param {string} subcatId - ID de la subcategoría
     * @returns {boolean}
     */
    subcategoriaTieneRiesgo(subcatId) {
        const subcat = this.subcategorias[subcatId];
        return subcat && subcat.riesgoNivelId && subcat.riesgoNivelId !== '';
    }

    /**
     * Elimina el nivel de riesgo de una subcategoría
     * @param {string} subcatId - ID de la subcategoría
     * @returns {boolean}
     */
    eliminarRiesgoDeSubcategoria(subcatId) {
        if (!this.subcategorias[subcatId]) {
            return false;
        }

        delete this.subcategorias[subcatId].riesgoNivelId;
        this.subcategorias[subcatId].fechaActualizacion = new Date().toISOString();
        this.fechaActualizacion = new Date();
        return true;
    }

    agregarSubcategoria(nombre, descripcion = '', heredaColor = true, colorPersonalizado = null, riesgoId = null) {
        try {
            if (!nombre || nombre.trim() === '') {
                throw new Error('El nombre de la subcategoría es requerido');
            }

            const subcatId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            this.subcategorias[subcatId] = {
                id: subcatId,
                nombre: nombre.trim(),
                descripcion: descripcion.trim() || '',
                fechaCreacion: new Date().toISOString(),
                fechaActualizacion: new Date().toISOString(),
                heredaColor: heredaColor,
                color: !heredaColor ? colorPersonalizado : null,
                riesgoNivelId: riesgoId || null
            };

            return subcatId;

        } catch (error) {
            console.error("Error agregando subcategoría:", error);
            throw error;
        }
    }

    eliminarSubcategoria(subcatId) {
        try {
            if (this.subcategorias[subcatId]) {
                delete this.subcategorias[subcatId];
                return true;
            }
            return false;
        } catch (error) {
            console.error("Error eliminando subcategoría:", error);
            return false;
        }
    }

    actualizarSubcategoria(subcatId, nuevosDatos) {
        try {
            if (!this.subcategorias[subcatId]) {
                return false;
            }

            this.subcategorias[subcatId] = {
                ...this.subcategorias[subcatId],
                ...nuevosDatos,
                fechaActualizacion: new Date().toISOString()
            };

            return true;

        } catch (error) {
            console.error("Error actualizando subcategoría:", error);
            return false;
        }
    }

    cambiarHerenciaColor(subcatId, heredaColor, colorPersonalizado = null) {
        if (!this.subcategorias[subcatId]) return false;

        this.subcategorias[subcatId].heredaColor = heredaColor;
        this.subcategorias[subcatId].color = !heredaColor ? colorPersonalizado : null;
        this.subcategorias[subcatId].fechaActualizacion = new Date().toISOString();

        return true;
    }

    obtenerColorSubcategoria(subcatId, colorCategoria) {
        const subcat = this.subcategorias[subcatId];
        if (!subcat) return colorCategoria;

        if (subcat.heredaColor === false && subcat.color) {
            return subcat.color;
        }

        return colorCategoria;
    }

    existeSubcategoria(nombreSubcategoria) {
        const nombre = nombreSubcategoria.toLowerCase().trim();

        for (const subcatId in this.subcategorias) {
            const subcat = this.subcategorias[subcatId];
            if (subcat.nombre && subcat.nombre.toLowerCase().trim() === nombre) {
                return true;
            }
        }
        return false;
    }

    getSubcategoriasAsArray(colorCategoria = null) {
        const subcategoriasArray = [];
        for (const subcatId in this.subcategorias) {
            const subcat = this.subcategorias[subcatId];
            const colorEfectivo = this.obtenerColorSubcategoria(subcatId, colorCategoria || this.color);

            subcategoriasArray.push({
                id: subcatId,
                ...subcat,
                colorEfectivo: colorEfectivo,
                riesgoNivelId: subcat.riesgoNivelId || null
            });
        }
        return subcategoriasArray;
    }

    getCantidadSubcategorias() {
        return Object.keys(this.subcategorias).length;
    }

    validar() {
        const errores = [];

        if (!this.nombre || this.nombre.trim() === '') {
            errores.push('El nombre de la categoría es requerido');
        }

        return {
            isValid: errores.length === 0,
            errores: errores
        };
    }

    getFechaCreacionFormateada() {
        return this._formatearFecha(this.fechaCreacion);
    }

    getFechaActualizacionFormateada() {
        return this._formatearFecha(this.fechaActualizacion);
    }

    toFirestore() {
        return {
            nombre: this.nombre,
            descripcion: this.descripcion,
            color: this.color,
            subcategorias: this.subcategorias || {},
            fechaCreacion: this.fechaCreacion,
            fechaActualizacion: new Date().toISOString()
        };
    }

    toFirestoreCreate() {
        return {
            nombre: this.nombre,
            descripcion: this.descripcion,
            color: this.color,
            subcategorias: this.subcategorias || {},
            fechaCreacion: serverTimestamp(),
            fechaActualizacion: serverTimestamp()
        };
    }

    toUI() {
        return {
            id: this.id,
            nombre: this.nombre,
            descripcion: this.descripcion,
            color: this.color,
            totalSubcategorias: this.getCantidadSubcategorias(),
            subcategorias: this.getSubcategoriasAsArray(this.color),
            fechaCreacion: this.getFechaCreacionFormateada(),
            fechaActualizacion: this.getFechaActualizacionFormateada(),
            organizacion: this.organizacionNombre,
            organizacionCamelCase: this.organizacionCamelCase
        };
    }
}

class CategoriaManager {
    constructor() {
        this.categorias = [];
        this.organizacionNombre = null;
        this.organizacionCamelCase = null;
        this.nombreColeccion = null;
        this.historialManager = null;

        this._cargarDatosOrganizacion();
    }

    async _getHistorialManager() {
        if (!this.historialManager) {
            try {
                const { HistorialUsuarioManager } = await import('/clases/historialUsuario.js');
                this.historialManager = new HistorialUsuarioManager();
            } catch (error) {
                console.error('Error inicializando historialManager:', error);
            }
        }
        return this.historialManager;
    }

    _cargarDatosOrganizacion() {
        try {
            const adminInfo = localStorage.getItem('adminInfo');
            if (adminInfo) {
                const adminData = JSON.parse(adminInfo);
                this.organizacionNombre = adminData.organizacion || 'Sin organización';
                this.organizacionCamelCase = adminData.organizacionCamelCase ||
                    this._generarCamelCase(this.organizacionNombre);
                return;
            }

            const userData = JSON.parse(localStorage.getItem('userData') || '{}');
            this.organizacionNombre = userData.organizacion || userData.empresa || 'Sin organización';
            this.organizacionCamelCase = userData.organizacionCamelCase ||
                this._generarCamelCase(this.organizacionNombre);

        } catch (error) {
            console.error('Error cargando datos de organización:', error);
            this.organizacionNombre = 'Sin organización';
            this.organizacionCamelCase = 'sinOrganizacion';
        }

        this.nombreColeccion = this._getCollectionName();
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

    _getCollectionName(organizacionOverride = null) {
        const orgId = organizacionOverride || this.organizacionCamelCase || 'sinOrganizacion';
        return `categorias_${orgId}`;
    }

    // ==================== MÉTODO: ASIGNAR RIESGO A SUBCATEGORÍA ====================
    async asignarRiesgoASubcategoria(categoriaId, subcategoriaId, riesgoId, usuarioActual = null, organizacionOverride = null) {
        try {
            const orgId = organizacionOverride || this.organizacionCamelCase;

            if (!orgId) {
                throw new Error('Se requiere ID de organización');
            }

            // Obtener la categoría actual
            const categoria = await this.obtenerCategoriaPorId(categoriaId, orgId);

            if (!categoria) {
                throw new Error('Categoría no encontrada');
            }

            if (!categoria.subcategorias[subcategoriaId]) {
                throw new Error('Subcategoría no encontrada');
            }

            const nombreSubcategoria = categoria.subcategorias[subcategoriaId].nombre || subcategoriaId;
            const nombreCategoria = categoria.nombre;

            // Asignar el nivel de riesgo usando el método de la clase Categoria
            const asignado = categoria.asignarRiesgoASubcategoria(subcategoriaId, riesgoId);

            if (!asignado) {
                throw new Error('No se pudo asignar el riesgo a la subcategoría');
            }

            const collectionName = this._getCollectionName(orgId);
            const categoriaRef = doc(db, collectionName, categoriaId);

            await consumo.registrarFirestoreActualizacion(collectionName, categoriaId);
            await updateDoc(categoriaRef, {
                subcategorias: categoria.subcategorias,
                fechaActualizacion: serverTimestamp()
            });

            // Actualizar caché
            const categoriaIndex = this.categorias.findIndex(c => c.id === categoriaId);
            if (categoriaIndex !== -1) {
                this.categorias[categoriaIndex].subcategorias = categoria.subcategorias;
                this.categorias[categoriaIndex].fechaActualizacion = new Date();
            }

            // Registrar en historial
            if (usuarioActual) {
                const historial = await this._getHistorialManager();
                if (historial) {
                    await historial.registrarActividad({
                        usuario: usuarioActual,
                        tipo: 'editar',
                        modulo: 'categorias',
                        descripcion: `Asignó nivel de riesgo a subcategoría "${nombreSubcategoria}" de categoría "${nombreCategoria}"`,
                        detalles: {
                            categoriaId,
                            categoriaNombre: nombreCategoria,
                            subcategoriaId,
                            subcategoriaNombre: nombreSubcategoria,
                            riesgoId
                        }
                    });
                }
            }

            return true;

        } catch (error) {
            console.error('Error asignando riesgo a subcategoría:', error);
            throw error;
        }
    }

    // ==================== MÉTODO: OBTENER RIESGO DE SUBCATEGORÍA ====================
    async obtenerRiesgoDeSubcategoria(categoriaId, subcategoriaId, organizacionOverride = null) {
        try {
            const orgId = organizacionOverride || this.organizacionCamelCase;

            if (!orgId) {
                return null;
            }

            const categoria = await this.obtenerCategoriaPorId(categoriaId, orgId);

            if (!categoria) {
                return null;
            }

            return categoria.obtenerRiesgoDeSubcategoria(subcategoriaId);

        } catch (error) {
            console.error('Error obteniendo riesgo de subcategoría:', error);
            return null;
        }
    }

    // ==================== MÉTODO: VERIFICAR SI SUBCATEGORÍA TIENE RIESGO ====================
    async subcategoriaTieneRiesgo(categoriaId, subcategoriaId, organizacionOverride = null) {
        try {
            const orgId = organizacionOverride || this.organizacionCamelCase;

            if (!orgId) {
                return false;
            }

            const categoria = await this.obtenerCategoriaPorId(categoriaId, orgId);

            if (!categoria) {
                return false;
            }

            return categoria.subcategoriaTieneRiesgo(subcategoriaId);

        } catch (error) {
            console.error('Error verificando si subcategoría tiene riesgo:', error);
            return false;
        }
    }

    // ==================== MÉTODO: ELIMINAR RIESGO DE SUBCATEGORÍA ====================
    async eliminarRiesgoDeSubcategoria(categoriaId, subcategoriaId, usuarioActual = null, organizacionOverride = null) {
        try {
            const orgId = organizacionOverride || this.organizacionCamelCase;

            if (!orgId) {
                throw new Error('Se requiere ID de organización');
            }

            const categoria = await this.obtenerCategoriaPorId(categoriaId, orgId);

            if (!categoria) {
                throw new Error('Categoría no encontrada');
            }

            if (!categoria.subcategorias[subcategoriaId]) {
                throw new Error('Subcategoría no encontrada');
            }

            const nombreSubcategoria = categoria.subcategorias[subcategoriaId].nombre || subcategoriaId;
            const nombreCategoria = categoria.nombre;
            const riesgoIdAnterior = categoria.subcategorias[subcategoriaId].riesgoNivelId;

            // Eliminar el nivel de riesgo
            const eliminado = categoria.eliminarRiesgoDeSubcategoria(subcategoriaId);

            if (!eliminado) {
                throw new Error('No se pudo eliminar el riesgo de la subcategoría');
            }

            const collectionName = this._getCollectionName(orgId);
            const categoriaRef = doc(db, collectionName, categoriaId);

            await consumo.registrarFirestoreActualizacion(collectionName, categoriaId);
            await updateDoc(categoriaRef, {
                subcategorias: categoria.subcategorias,
                fechaActualizacion: serverTimestamp()
            });

            // Actualizar caché
            const categoriaIndex = this.categorias.findIndex(c => c.id === categoriaId);
            if (categoriaIndex !== -1) {
                this.categorias[categoriaIndex].subcategorias = categoria.subcategorias;
                this.categorias[categoriaIndex].fechaActualizacion = new Date();
            }

            // Registrar en historial
            if (usuarioActual) {
                const historial = await this._getHistorialManager();
                if (historial) {
                    await historial.registrarActividad({
                        usuario: usuarioActual,
                        tipo: 'editar',
                        modulo: 'categorias',
                        descripcion: `Eliminó nivel de riesgo de subcategoría "${nombreSubcategoria}" de categoría "${nombreCategoria}"`,
                        detalles: {
                            categoriaId,
                            categoriaNombre: nombreCategoria,
                            subcategoriaId,
                            subcategoriaNombre: nombreSubcategoria,
                            riesgoIdAnterior
                        }
                    });
                }
            }

            return true;

        } catch (error) {
            console.error('Error eliminando riesgo de subcategoría:', error);
            throw error;
        }
    }

    // ==================== MÉTODO: ACTUALIZAR SUBCATEGORÍA COMPLETA ====================
    async actualizarSubcategoria(categoriaId, subcategoriaId, datosActualizacion, usuarioActual = null, organizacionOverride = null) {
        try {
            const orgId = organizacionOverride || this.organizacionCamelCase;

            if (!orgId) {
                throw new Error('Se requiere ID de organización');
            }

            const categoria = await this.obtenerCategoriaPorId(categoriaId, orgId);

            if (!categoria) {
                throw new Error('Categoría no encontrada');
            }

            if (!categoria.subcategorias[subcategoriaId]) {
                throw new Error('Subcategoría no encontrada');
            }

            const nombreSubcategoria = categoria.subcategorias[subcategoriaId].nombre || subcategoriaId;
            const nombreCategoria = categoria.nombre;

            // Actualizar datos
            categoria.subcategorias[subcategoriaId] = {
                ...categoria.subcategorias[subcategoriaId],
                ...datosActualizacion,
                fechaActualizacion: new Date().toISOString()
            };

            const collectionName = this._getCollectionName(orgId);
            const categoriaRef = doc(db, collectionName, categoriaId);

            await consumo.registrarFirestoreActualizacion(collectionName, categoriaId);
            await updateDoc(categoriaRef, {
                subcategorias: categoria.subcategorias,
                fechaActualizacion: serverTimestamp()
            });

            // Actualizar caché
            const categoriaIndex = this.categorias.findIndex(c => c.id === categoriaId);
            if (categoriaIndex !== -1) {
                this.categorias[categoriaIndex].subcategorias = categoria.subcategorias;
                this.categorias[categoriaIndex].fechaActualizacion = new Date();
            }

            // Registrar en historial
            if (usuarioActual) {
                const historial = await this._getHistorialManager();
                if (historial) {
                    await historial.registrarActividad({
                        usuario: usuarioActual,
                        tipo: 'editar',
                        modulo: 'categorias',
                        descripcion: `Actualizó subcategoría "${nombreSubcategoria}" de categoría "${nombreCategoria}"`,
                        detalles: {
                            categoriaId,
                            categoriaNombre: nombreCategoria,
                            subcategoriaId,
                            subcategoriaNombre: nombreSubcategoria,
                            cambios: Object.keys(datosActualizacion)
                        }
                    });
                }
            }

            return true;

        } catch (error) {
            console.error('Error actualizando subcategoría:', error);
            throw error;
        }
    }

    async crearCategoria(data, usuarioActual = null) {
        try {
            if (!data.nombre || data.nombre.trim() === '') {
                throw new Error('El nombre de la categoría es requerido');
            }

            if (!this.organizacionCamelCase) {
                this._cargarDatosOrganizacion();
            }

            const collectionName = this._getCollectionName();

            await consumo.registrarFirestoreLectura(collectionName, 'verificar nombre');

            const existe = await this.verificarCategoriaExistente(data.nombre.trim());
            if (existe) {
                throw new Error(`Ya existe una categoría con el nombre "${data.nombre}"`);
            }

            let subcategorias = {};
            const subcategoriasArray = [];

            if (data.subcategorias) {
                if (Array.isArray(data.subcategorias)) {
                    data.subcategorias.forEach(subcat => {
                        const subcatId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
                        subcategorias[subcatId] = {
                            id: subcatId,
                            nombre: subcat.nombre || '',
                            descripcion: subcat.descripcion || '',
                            fechaCreacion: new Date().toISOString(),
                            fechaActualizacion: new Date().toISOString(),
                            heredaColor: subcat.heredaColor !== undefined ? subcat.heredaColor : true,
                            color: subcat.color || null,
                            riesgoNivelId: subcat.riesgoNivelId || null
                        };
                        subcategoriasArray.push(subcat.nombre || '');
                    });
                } else if (typeof data.subcategorias === 'object') {
                    subcategorias = JSON.parse(JSON.stringify(data.subcategorias));
                    Object.keys(subcategorias).forEach(key => {
                        subcategoriasArray.push(subcategorias[key].nombre || key);
                    });
                }
            }

            const categoriaFirestoreData = {
                nombre: data.nombre.trim(),
                descripcion: data.descripcion?.trim() || '',
                color: data.color || '#2f8cff',
                subcategorias: subcategorias,
                fechaCreacion: serverTimestamp(),
                fechaActualizacion: serverTimestamp()
            };

            const categoriasCollection = collection(db, collectionName);

            await consumo.registrarFirestoreEscritura(collectionName, 'nueva categoría');

            const docRef = await addDoc(categoriasCollection, categoriaFirestoreData);
            const categoriaId = docRef.id;

            const nuevaCategoria = new Categoria(categoriaId, {
                ...categoriaFirestoreData,
                fechaCreacion: new Date(),
                fechaActualizacion: new Date(),
                organizacionCamelCase: this.organizacionCamelCase,
                organizacionNombre: this.organizacionNombre
            });

            this.categorias.unshift(nuevaCategoria);

            if (usuarioActual) {
                const historial = await this._getHistorialManager();
                if (historial) {
                    await historial.registrarActividad({
                        usuario: usuarioActual,
                        tipo: 'crear',
                        modulo: 'categorias',
                        descripcion: historial.generarDescripcion('crear', 'categorias', {
                            nombre: data.nombre,
                            totalSubcategorias: subcategoriasArray.length
                        }),
                        detalles: {
                            categoriaId,
                            nombre: data.nombre,
                            color: data.color,
                            totalSubcategorias: subcategoriasArray.length,
                            subcategorias: subcategoriasArray
                        }
                    });
                }
            }

            return nuevaCategoria;

        } catch (error) {
            console.error('Error creando categoría:', error);
            throw error;
        }
    }

    async obtenerCategoriasPorOrganizacion(organizacionOverride = null, usuarioActual = null) {
        try {
            const orgId = organizacionOverride || this.organizacionCamelCase;

            if (!orgId) {
                return [];
            }

            const collectionName = this._getCollectionName(orgId);
            const categoriasCollection = collection(db, collectionName);

            await consumo.registrarFirestoreLectura(collectionName, 'lista categorías');

            const categoriasSnapshot = await getDocs(categoriasCollection);
            const categorias = [];

            categoriasSnapshot.forEach(doc => {
                try {
                    const data = doc.data();
                    const categoria = new Categoria(doc.id, {
                        ...data,
                        id: doc.id,
                        organizacionCamelCase: orgId,
                        organizacionNombre: this.organizacionNombre
                    });
                    categorias.push(categoria);
                } catch (error) {
                    console.error(`Error procesando categoría ${doc.id}:`, error);
                }
            });

            categorias.sort((a, b) => b.fechaCreacion - a.fechaCreacion);
            this.categorias = categorias;

            if (usuarioActual) {
                const historial = await this._getHistorialManager();
                if (historial) {
                    await historial.registrarActividad({
                        usuario: usuarioActual,
                        tipo: 'leer',
                        modulo: 'categorias',
                        descripcion: `Consultó lista de categorías (${categorias.length} categorías)`,
                        detalles: { total: categorias.length }
                    });
                }
            }

            return categorias;

        } catch (error) {
            console.error('Error obteniendo categorías:', error);
            return [];
        }
    }

    async obtenerCategoriaPorId(categoriaId, organizacionOverride = null) {
        const orgId = organizacionOverride || this.organizacionCamelCase;

        if (!orgId) {
            return null;
        }

        const categoriaInMemory = this.categorias.find(cat => cat.id === categoriaId);
        if (categoriaInMemory) return categoriaInMemory;

        try {
            const collectionName = this._getCollectionName(orgId);
            const categoriaRef = doc(db, collectionName, categoriaId);

            await consumo.registrarFirestoreLectura(collectionName, categoriaId);

            const categoriaSnap = await getDoc(categoriaRef);

            if (categoriaSnap.exists()) {
                const data = categoriaSnap.data();
                const categoria = new Categoria(categoriaId, {
                    ...data,
                    id: categoriaId,
                    organizacionCamelCase: orgId,
                    organizacionNombre: this.organizacionNombre
                });
                this.categorias.push(categoria);
                return categoria;
            }

            return null;

        } catch (error) {
            console.error('Error obteniendo categoría:', error);
            return null;
        }
    }

    async actualizarCategoria(categoriaId, nuevosDatos, usuarioActual = null, organizacionOverride = null) {
        try {
            const orgId = organizacionOverride || this.organizacionCamelCase;

            if (!orgId) {
                throw new Error('Se requiere ID de organización');
            }

            const collectionName = this._getCollectionName(orgId);
            const categoriaRef = doc(db, collectionName, categoriaId);

            await consumo.registrarFirestoreLectura(collectionName, categoriaId);

            const categoriaSnap = await getDoc(categoriaRef);

            if (!categoriaSnap.exists()) {
                throw new Error(`Categoría con ID ${categoriaId} no encontrada`);
            }

            const datosActuales = categoriaSnap.data();

            if (nuevosDatos.nombre && nuevosDatos.nombre !== datosActuales.nombre) {
                await consumo.registrarFirestoreLectura(collectionName, 'verificar nombre');

                const existe = await this.verificarCategoriaExistente(nuevosDatos.nombre, orgId, categoriaId);
                if (existe) {
                    throw new Error(`Ya existe otra categoría con el nombre "${nuevosDatos.nombre}"`);
                }
            }

            const datosActualizados = {
                ...nuevosDatos,
                fechaActualizacion: serverTimestamp()
            };

            delete datosActualizados.id;
            delete datosActualizados.organizacionCamelCase;
            delete datosActualizados.organizacionNombre;

            await consumo.registrarFirestoreActualizacion(collectionName, categoriaId);

            await updateDoc(categoriaRef, datosActualizados);

            const categoriaIndex = this.categorias.findIndex(c => c.id === categoriaId);
            if (categoriaIndex !== -1) {
                const categoriaActual = this.categorias[categoriaIndex];
                Object.keys(datosActualizados).forEach(key => {
                    if (key !== 'id') {
                        categoriaActual[key] = datosActualizados[key];
                    }
                });
                categoriaActual.fechaActualizacion = new Date();
            }

            if (usuarioActual) {
                const historial = await this._getHistorialManager();
                if (historial) {
                    const cambios = [];
                    if (datosActuales.nombre !== nuevosDatos.nombre) {
                        cambios.push(`nombre: "${datosActuales.nombre}" → "${nuevosDatos.nombre}"`);
                    }
                    if (datosActuales.color !== nuevosDatos.color) {
                        cambios.push(`color: ${datosActuales.color} → ${nuevosDatos.color}`);
                    }

                    await historial.registrarActividad({
                        usuario: usuarioActual,
                        tipo: 'editar',
                        modulo: 'categorias',
                        descripcion: historial.generarDescripcion('editar', 'categorias', {
                            nombre: nuevosDatos.nombre || datosActuales.nombre,
                            nombreOriginal: datosActuales.nombre,
                            cambios: cambios.join(', ')
                        }),
                        detalles: {
                            categoriaId,
                            nombre: nuevosDatos.nombre || datosActuales.nombre,
                            nombreOriginal: datosActuales.nombre,
                            cambios
                        }
                    });
                }
            }

            return await this.obtenerCategoriaPorId(categoriaId, orgId);

        } catch (error) {
            console.error('Error actualizando categoría:', error);
            throw error;
        }
    }

    async eliminarCategoria(categoriaId, usuarioActual = null, organizacionOverride = null) {
        try {
            const orgId = organizacionOverride || this.organizacionCamelCase;

            if (!orgId) {
                throw new Error('Se requiere ID de organización');
            }

            const categoria = await this.obtenerCategoriaPorId(categoriaId, orgId);

            if (!categoria) {
                throw new Error(`Categoría ${categoriaId} no encontrada`);
            }

            const totalSubcategorias = categoria.getCantidadSubcategorias();
            const nombreCategoria = categoria.nombre;

            if (totalSubcategorias > 0) {
                throw new Error('No se puede eliminar una categoría con subcategorías');
            }

            const collectionName = this._getCollectionName(orgId);
            const categoriaRef = doc(db, collectionName, categoriaId);

            await consumo.registrarFirestoreEliminacion(collectionName, categoriaId);

            await deleteDoc(categoriaRef);

            const categoriaIndex = this.categorias.findIndex(c => c.id === categoriaId);
            if (categoriaIndex !== -1) {
                this.categorias.splice(categoriaIndex, 1);
            }

            if (usuarioActual) {
                const historial = await this._getHistorialManager();
                if (historial) {
                    await historial.registrarActividad({
                        usuario: usuarioActual,
                        tipo: 'eliminar',
                        modulo: 'categorias',
                        descripcion: historial.generarDescripcion('eliminar', 'categorias', {
                            nombre: nombreCategoria
                        }),
                        detalles: {
                            categoriaId,
                            nombre: nombreCategoria
                        }
                    });
                }
            }

            return true;

        } catch (error) {
            console.error('Error eliminando categoría:', error);
            throw error;
        }
    }

    async verificarCategoriaExistente(nombre, organizacionOverride = null, excludeId = null) {
        try {
            const orgId = organizacionOverride || this.organizacionCamelCase;

            if (!orgId) return false;

            const collectionName = this._getCollectionName(orgId);
            const categoriasCollection = collection(db, collectionName);

            const q = query(
                categoriasCollection,
                where("nombre", "==", nombre)
            );

            await consumo.registrarFirestoreLectura(collectionName, 'verificar nombre');

            const querySnapshot = await getDocs(q);

            if (excludeId) {
                return querySnapshot.docs.some(doc => doc.id !== excludeId);
            }

            return !querySnapshot.empty;

        } catch (error) {
            console.error("Error verificando categoría:", error);
            return false;
        }
    }

    async agregarSubcategoria(categoriaId, nombreSubcategoria, descripcion = '', heredaColor = true, colorPersonalizado = null, riesgoId = null, usuarioActual = null, organizacionOverride = null) {
        try {
            const orgId = organizacionOverride || this.organizacionCamelCase;

            if (!orgId) {
                throw new Error('Se requiere ID de organización');
            }

            const categoria = await this.obtenerCategoriaPorId(categoriaId, orgId);

            if (!categoria) {
                throw new Error('Categoría no encontrada');
            }

            if (categoria.existeSubcategoria(nombreSubcategoria)) {
                throw new Error(`Ya existe una subcategoría con el nombre "${nombreSubcategoria}"`);
            }

            const subcatId = categoria.agregarSubcategoria(nombreSubcategoria, descripcion, heredaColor, colorPersonalizado, riesgoId);

            const collectionName = this._getCollectionName(orgId);
            const categoriaRef = doc(db, collectionName, categoriaId);

            await consumo.registrarFirestoreActualizacion(collectionName, categoriaId);

            await updateDoc(categoriaRef, {
                subcategorias: categoria.subcategorias,
                fechaActualizacion: serverTimestamp()
            });

            if (usuarioActual) {
                const historial = await this._getHistorialManager();
                if (historial) {
                    await historial.registrarActividad({
                        usuario: usuarioActual,
                        tipo: 'crear',
                        modulo: 'categorias',
                        descripcion: `Agregó subcategoría "${nombreSubcategoria}" a categoría "${categoria.nombre}"`,
                        detalles: {
                            categoriaId,
                            categoriaNombre: categoria.nombre,
                            subcategoriaId: subcatId,
                            subcategoriaNombre: nombreSubcategoria,
                            heredaColor,
                            color: !heredaColor ? colorPersonalizado : null,
                            riesgoId: riesgoId || null
                        }
                    });
                }
            }

            return subcatId;

        } catch (error) {
            console.error('Error agregando subcategoría:', error);
            throw error;
        }
    }

    async eliminarSubcategoria(categoriaId, subcategoriaId, usuarioActual = null, organizacionOverride = null) {
        try {
            const orgId = organizacionOverride || this.organizacionCamelCase;

            if (!orgId) {
                throw new Error('Se requiere ID de organización');
            }

            const categoria = await this.obtenerCategoriaPorId(categoriaId, orgId);

            if (!categoria) {
                throw new Error('Categoría no encontrada');
            }

            const subcategoria = categoria.subcategorias[subcategoriaId];
            if (!subcategoria) {
                throw new Error('Subcategoría no encontrada');
            }

            const nombreSubcategoria = subcategoria.nombre || subcategoriaId;

            categoria.eliminarSubcategoria(subcategoriaId);

            const collectionName = this._getCollectionName(orgId);
            const categoriaRef = doc(db, collectionName, categoriaId);

            await consumo.registrarFirestoreActualizacion(collectionName, categoriaId);

            await updateDoc(categoriaRef, {
                subcategorias: categoria.subcategorias,
                fechaActualizacion: serverTimestamp()
            });

            if (usuarioActual) {
                const historial = await this._getHistorialManager();
                if (historial) {
                    await historial.registrarActividad({
                        usuario: usuarioActual,
                        tipo: 'eliminar',
                        modulo: 'categorias',
                        descripcion: `Eliminó subcategoría "${nombreSubcategoria}" de categoría "${categoria.nombre}"`,
                        detalles: {
                            categoriaId,
                            categoriaNombre: categoria.nombre,
                            subcategoriaId,
                            subcategoriaNombre: nombreSubcategoria
                        }
                    });
                }
            }

            return true;

        } catch (error) {
            console.error('Error eliminando subcategoría:', error);
            throw error;
        }
    }

    async cargarTodasCategorias() {
        return await this.obtenerCategoriasPorOrganizacion();
    }

    async obtenerTodasCategorias() {
        if (this.categorias.length === 0) {
            return await this.cargarTodasCategorias();
        }
        return this.categorias;
    }
}

export { Categoria, CategoriaManager };