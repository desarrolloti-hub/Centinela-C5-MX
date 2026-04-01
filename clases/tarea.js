// tarea.js - VERSIÓN MEJORADA CON NOTAS GENERALES Y RECORDATORIOS
// UNA SOLA COLECCIÓN: tareas_[organizacion]
// CON REGISTRO DE CONSUMO FIREBASE

import {
    collection,
    doc,
    getDocs,
    getDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    serverTimestamp,
    addDoc
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

import { db } from '/config/firebase-config.js';

// [MODIFICACIÓN]: Importar la instancia de consumo
import consumo from '/clases/consumoFirebase.js';

class Tarea {
    constructor(id, data) {
        this.id = id;

        // Datos principales de la tarea/nota
        this.nombreActividad = data.nombreActividad || '';
        this.descripcion = data.descripcion || '';

        // Items del checklist (MÚLTIPLES ITEMS)
        this.items = data.items || {}; // Objeto con los items

        // Tipo de tarea: 'personal', 'compartida', 'area', 'general', 'global'
        this.tipo = data.tipo || 'personal';

        // Visibilidad y destinatarios
        this.usuariosCompartidosIds = data.usuariosCompartidosIds || [];
        this.areaId = data.areaId || '';
        this.cargosIds = data.cargosIds || [];

        // ✅ NUEVO: Categoría y subcategoría
        this.categoriaId = data.categoriaId || null;
        this.subcategoriaId = data.subcategoriaId || null;

        // Metadatos de usuario
        this.organizacionCamelCase = data.organizacionCamelCase || '';
        this.creadoPor = data.creadoPor || '';
        this.creadoPorNombre = data.creadoPorNombre || ''; // NUEVO: nombre de quien creó
        this.actualizadoPor = data.actualizadoPor || '';
        this.actualizadoPorNombre = data.actualizadoPorNombre || ''; // NUEVO: nombre de quien actualizó

        // Fechas
        this.fechaCreacion = data.fechaCreacion ? this._convertirFecha(data.fechaCreacion) : new Date();
        this.fechaActualizacion = data.fechaActualizacion ? this._convertirFecha(data.fechaActualizacion) : new Date();

        // NUEVO: Fecha límite o recordatorio
        this.fechaLimite = data.fechaLimite ? this._convertirFecha(data.fechaLimite) : null;
        this.tieneRecordatorio = data.tieneRecordatorio || false;

        // Progreso
        this._calcularProgreso();
    }

    _convertirFecha(fecha) {
        if (!fecha) return null;
        if (fecha && typeof fecha.toDate === 'function') return fecha.toDate();
        if (fecha instanceof Date) return fecha;
        if (typeof fecha === 'string' || typeof fecha === 'number') {
            const date = new Date(fecha);
            if (!isNaN(date.getTime())) return date;
        }
        if (fecha && typeof fecha === 'object' && 'seconds' in fecha) {
            return new Date(fecha.seconds * 1000);
        }
        return null;
    }

    _formatearFecha(fecha, incluirHora = true) {
        if (!fecha) return 'No disponible';
        try {
            const date = this._convertirFecha(fecha);
            if (incluirHora) {
                return date.toLocaleDateString('es-MX', {
                    year: 'numeric', month: 'long', day: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                });
            } else {
                return date.toLocaleDateString('es-MX', {
                    year: 'numeric', month: 'long', day: 'numeric'
                });
            }
        } catch {
            return 'Fecha inválida';
        }
    }

    _calcularProgreso() {
        const totalItems = Object.keys(this.items).length;
        const itemsCompletados = Object.values(this.items).filter(item => item.completado).length;

        this.totalItems = totalItems;
        this.itemsCompletados = itemsCompletados;
        this.porcentajeCompletado = totalItems > 0 ? Math.round((itemsCompletados / totalItems) * 100) : 0;
        this.completada = totalItems > 0 && itemsCompletados === totalItems;
    }

    // =============================================
    // MÉTODOS PARA GESTIONAR ITEMS DEL CHECKLIST
    // =============================================

    agregarItem(texto) {
        if (!texto || texto.trim() === '') {
            throw new Error('El texto del item es requerido');
        }

        const itemId = `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        this.items[itemId] = {
            id: itemId,
            texto: texto.trim(),
            completado: false,
            fechaCreacion: new Date().toISOString()
        };

        this._calcularProgreso();
        return itemId;
    }

    agregarMultiplesItems(textos) {
        const idsCreados = [];
        textos.forEach(texto => {
            if (texto && texto.trim() !== '') {
                const id = this.agregarItem(texto);
                idsCreados.push(id);
            }
        });
        return idsCreados;
    }

    actualizarItem(itemId, nuevoTexto) {
        if (!this.items[itemId]) return false;
        if (!nuevoTexto || nuevoTexto.trim() === '') return false;

        this.items[itemId].texto = nuevoTexto.trim();
        return true;
    }

    marcarItem(itemId, completado = true) {
        if (!this.items[itemId]) return false;

        this.items[itemId].completado = completado;
        this.items[itemId].fechaCompletado = completado ? new Date().toISOString() : null;

        this._calcularProgreso();
        return true;
    }

    eliminarItem(itemId) {
        if (!this.items[itemId]) return false;

        delete this.items[itemId];
        this._calcularProgreso();
        return true;
    }

    getItemsArray() {
        return Object.values(this.items).sort((a, b) => {
            if (a.completado === b.completado) return 0;
            return a.completado ? 1 : -1;
        });
    }

    // =============================================
    // MÉTODOS DE VISIBILIDAD (MEJORADOS)
    // =============================================

    esVisibleParaUsuario(usuarioId, usuarioAreaId, usuarioCargoId) {
        // 'global' significa que TODOS en la organización pueden verla
        if (this.tipo === 'global') return true;

        // 'general' (lo mantengo por compatibilidad)
        if (this.tipo === 'general') return true;

        // Personal: solo el creador
        if (this.tipo === 'personal') {
            return this.creadoPor === usuarioId;
        }

        // Compartida: usuarios específicos
        if (this.tipo === 'compartida') {
            return this.usuariosCompartidosIds.includes(usuarioId);
        }

        // Por área: todos en el área (y opcionalmente cargos específicos)
        if (this.tipo === 'area') {
            if (this.areaId && this.areaId !== usuarioAreaId) return false;
            if (this.cargosIds && this.cargosIds.length > 0) {
                return this.cargosIds.includes(usuarioCargoId);
            }
            return true;
        }

        return false;
    }

    /**
     * NUEVO: Verifica si el usuario puede editar esta tarea
     * Solo el creador puede editar, excepto para tareas globales que pueden ser editadas por admins
     */
    puedeEditar(usuarioId, esAdmin = false) {
        if (this.creadoPor === usuarioId) return true;
        if (this.tipo === 'global' && esAdmin) return true;
        return false;
    }

    // =============================================
    // MÉTODOS DE FORMATEO
    // =============================================

    toFirestore() {
        return {
            nombreActividad: this.nombreActividad,
            descripcion: this.descripcion,
            items: this.items,
            tipo: this.tipo,
            usuariosCompartidosIds: this.usuariosCompartidosIds,
            areaId: this.areaId,
            cargosIds: this.cargosIds,
            categoriaId: this.categoriaId,
            subcategoriaId: this.subcategoriaId,
            organizacionCamelCase: this.organizacionCamelCase,
            creadoPor: this.creadoPor,
            creadoPorNombre: this.creadoPorNombre,
            actualizadoPor: this.actualizadoPor,
            actualizadoPorNombre: this.actualizadoPorNombre,
            fechaCreacion: this.fechaCreacion,
            fechaActualizacion: this.fechaActualizacion,
            fechaLimite: this.fechaLimite,
            tieneRecordatorio: this.tieneRecordatorio,
            totalItems: this.totalItems,
            itemsCompletados: this.itemsCompletados,
            porcentajeCompletado: this.porcentajeCompletado,
            completada: this.completada
        };
    }

    toUI() {
        return {
            id: this.id,
            nombreActividad: this.nombreActividad,
            descripcion: this.descripcion,
            tipo: this.tipo,
            items: this.getItemsArray(),
            totalItems: this.totalItems,
            itemsCompletados: this.itemsCompletados,
            porcentajeCompletado: this.porcentajeCompletado,
            completada: this.completada,
            usuariosCompartidosIds: this.usuariosCompartidosIds,
            areaId: this.areaId,
            cargosIds: this.cargosIds,
            categoriaId: this.categoriaId,
            subcategoriaId: this.subcategoriaId,
            fechaCreacion: this._formatearFecha(this.fechaCreacion),
            fechaCreacionRaw: this.fechaCreacion,
            fechaActualizacion: this._formatearFecha(this.fechaActualizacion),
            fechaActualizacionRaw: this.fechaActualizacion,
            fechaLimite: this.fechaLimite ? this._formatearFecha(this.fechaLimite, true) : null,
            fechaLimiteRaw: this.fechaLimite,
            tieneRecordatorio: this.tieneRecordatorio,
            creadoPor: this.creadoPor,
            creadoPorNombre: this.creadoPorNombre || 'Usuario',
            actualizadoPor: this.actualizadoPor,
            actualizadoPorNombre: this.actualizadoPorNombre || 'Usuario'
        };
    }

    /**
     * NUEVO: Verifica si la tarea está próxima a vencer
     */
    estaProximoAVencer(diasAntelacion = 2) {
        if (!this.fechaLimite) return false;
        const hoy = new Date();
        const fechaLimite = this._convertirFecha(this.fechaLimite);
        const diferenciaDias = Math.ceil((fechaLimite - hoy) / (1000 * 60 * 60 * 24));
        return diferenciaDias > 0 && diferenciaDias <= diasAntelacion;
    }

    /**
     * NUEVO: Verifica si la tarea está vencida
     */
    estaVencida() {
        if (!this.fechaLimite) return false;
        const hoy = new Date();
        const fechaLimite = this._convertirFecha(this.fechaLimite);
        return fechaLimite < hoy && !this.completada;
    }
}

class TareaManager {
    constructor() {
        this.tareas = [];
        this.historialManager = null;
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

    _getCollectionName(organizacionCamelCase) {
        return `tareas_${organizacionCamelCase}`;
    }

    // =============================================
    // MÉTODOS CRUD (MEJORADOS)
    // =============================================

    async crearTarea(tareaData, usuarioActual) {
        try {
            if (!usuarioActual || !usuarioActual.organizacionCamelCase) {
                throw new Error('Usuario no tiene organización asignada');
            }

            if (!tareaData.nombreActividad) {
                throw new Error('El nombre de la actividad es requerido');
            }

            const organizacion = usuarioActual.organizacionCamelCase;
            const collectionName = this._getCollectionName(organizacion);
            const tareasCollection = collection(db, collectionName);

            // Procesar items si vienen como array
            let items = {};
            if (tareaData.items && Array.isArray(tareaData.items)) {
                tareaData.items.forEach(itemTexto => {
                    if (itemTexto && itemTexto.trim() !== '') {
                        const itemId = `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                        items[itemId] = {
                            id: itemId,
                            texto: itemTexto.trim(),
                            completado: false,
                            fechaCreacion: new Date().toISOString()
                        };
                    }
                });
            } else if (tareaData.items && typeof tareaData.items === 'object') {
                items = JSON.parse(JSON.stringify(tareaData.items));
            }

            // Procesar fecha límite si existe
            let fechaLimite = null;
            if (tareaData.fechaLimite) {
                fechaLimite = this._procesarFecha(tareaData.fechaLimite);
            }

            const tareaFirestoreData = {
                nombreActividad: tareaData.nombreActividad.trim(),
                descripcion: tareaData.descripcion?.trim() || '',
                items: items,
                tipo: tareaData.tipo || 'personal',
                usuariosCompartidosIds: tareaData.usuariosCompartidosIds || [],
                areaId: tareaData.areaId || '',
                cargosIds: tareaData.cargosIds || [],
                categoriaId: tareaData.categoriaId || null,
                subcategoriaId: tareaData.subcategoriaId || null,
                organizacionCamelCase: organizacion,
                creadoPor: usuarioActual.id,
                creadoPorNombre: usuarioActual.nombreCompleto || usuarioActual.email || 'Usuario',
                actualizadoPor: usuarioActual.id,
                actualizadoPorNombre: usuarioActual.nombreCompleto || usuarioActual.email || 'Usuario',
                fechaCreacion: serverTimestamp(),
                fechaActualizacion: serverTimestamp(),
                fechaLimite: fechaLimite,
                tieneRecordatorio: tareaData.tieneRecordatorio || false
            };

            // [MODIFICACIÓN]: Registrar ESCRITURA
            await consumo.registrarFirestoreEscritura(collectionName, 'nueva tarea');

            const docRef = await addDoc(tareasCollection, tareaFirestoreData);

            const nuevaTarea = new Tarea(docRef.id, {
                ...tareaFirestoreData,
                fechaCreacion: new Date(),
                fechaActualizacion: new Date()
            });

            this.tareas.unshift(nuevaTarea);
            return nuevaTarea;

        } catch (error) {
            console.error('Error creando tarea:', error);
            throw error;
        }
    }

    _procesarFecha(fecha) {
        if (!fecha) return null;
        if (fecha instanceof Date) return fecha;
        if (typeof fecha === 'string') {
            const date = new Date(fecha);
            return isNaN(date.getTime()) ? null : date;
        }
        return null;
    }

    /**
     * NUEVO: Obtener tareas visibles para un usuario específico
     */
    async getTareasVisiblesParaUsuario(usuario) {
        try {
            if (!usuario || !usuario.organizacionCamelCase) return [];

            const todasLasTareas = await this.getTodasLasTareas(usuario.organizacionCamelCase);

            const tareasVisibles = todasLasTareas.filter(tarea =>
                tarea.esVisibleParaUsuario(
                    usuario.id,
                    usuario.areaId,
                    usuario.cargoId
                )
            );

            return tareasVisibles;

        } catch (error) {
            console.error('Error obteniendo tareas visibles:', error);
            return [];
        }
    }

    async getTodasLasTareas(organizacionCamelCase) {
        try {
            if (!organizacionCamelCase) return [];

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const tareasCollection = collection(db, collectionName);
            const tareasQuery = query(tareasCollection, orderBy("fechaCreacion", "desc"));
            
            // [MODIFICACIÓN]: Registrar LECTURA
            await consumo.registrarFirestoreLectura(collectionName, 'lista tareas');
            
            const snapshot = await getDocs(tareasQuery);

            const tareas = [];
            snapshot.forEach(doc => {
                try {
                    const tarea = new Tarea(doc.id, doc.data());
                    tareas.push(tarea);
                } catch (error) {
                    console.error('Error procesando tarea:', error);
                }
            });

            this.tareas = tareas;
            return tareas;

        } catch (error) {
            console.error('Error obteniendo todas las tareas:', error);
            return [];
        }
    }

    async getTareaById(tareaId, organizacionCamelCase) {
        if (!organizacionCamelCase) return null;

        const tareaInMemory = this.tareas.find(t => t.id === tareaId);
        if (tareaInMemory) return tareaInMemory;

        try {
            const collectionName = this._getCollectionName(organizacionCamelCase);
            const tareaRef = doc(db, collectionName, tareaId);
            
            // [MODIFICACIÓN]: Registrar LECTURA
            await consumo.registrarFirestoreLectura(collectionName, tareaId);
            
            const tareaSnap = await getDoc(tareaRef);

            if (tareaSnap.exists()) {
                const data = tareaSnap.data();
                const tarea = new Tarea(tareaId, { ...data, id: tareaId });
                this.tareas.push(tarea);
                return tarea;
            }
            return null;

        } catch (error) {
            console.error('Error obteniendo tarea por ID:', error);
            return null;
        }
    }

    /**
     * NUEVO: Obtener tareas por tipo
     */
    async getTareasPorTipo(organizacionCamelCase, tipo, usuario = null) {
        try {
            const todasLasTareas = await this.getTodasLasTareas(organizacionCamelCase);

            return todasLasTareas.filter(tarea => {
                if (tarea.tipo !== tipo) return false;
                if (usuario) {
                    return tarea.esVisibleParaUsuario(
                        usuario.id,
                        usuario.areaId,
                        usuario.cargoId
                    );
                }
                return true;
            });

        } catch (error) {
            console.error('Error obteniendo tareas por tipo:', error);
            return [];
        }
    }

    /**
     * NUEVO: Obtener tareas con recordatorios próximos
     */
    async getTareasConRecordatorioProximo(organizacionCamelCase, diasAntelacion = 2) {
        try {
            const todasLasTareas = await this.getTodasLasTareas(organizacionCamelCase);

            return todasLasTareas.filter(tarea =>
                tarea.tieneRecordatorio &&
                tarea.estaProximoAVencer(diasAntelacion) &&
                !tarea.completada
            );

        } catch (error) {
            console.error('Error obteniendo tareas con recordatorio:', error);
            return [];
        }
    }

    /**
     * NUEVO: Obtener tareas vencidas
     */
    async getTareasVencidas(organizacionCamelCase) {
        try {
            const todasLasTareas = await this.getTodasLasTareas(organizacionCamelCase);

            return todasLasTareas.filter(tarea =>
                tarea.estaVencida() && !tarea.completada
            );

        } catch (error) {
            console.error('Error obteniendo tareas vencidas:', error);
            return [];
        }
    }

    async agregarItemTarea(tareaId, texto, usuarioActual, organizacionCamelCase) {
        try {
            const tarea = await this.getTareaById(tareaId, organizacionCamelCase);
            if (!tarea) throw new Error('Tarea no encontrada');

            // Verificar permisos
            if (!tarea.puedeEditar(usuarioActual.id, usuarioActual.esAdmin)) {
                throw new Error('No tienes permiso para modificar esta tarea');
            }

            const itemId = tarea.agregarItem(texto);

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const tareaRef = doc(db, collectionName, tareaId);

            // [MODIFICACIÓN]: Registrar ACTUALIZACIÓN
            await consumo.registrarFirestoreActualizacion(collectionName, tareaId);
            
            await updateDoc(tareaRef, {
                items: tarea.items,
                fechaActualizacion: serverTimestamp(),
                actualizadoPor: usuarioActual.id,
                actualizadoPorNombre: usuarioActual.nombreCompleto || usuarioActual.email || 'Usuario'
            });

            return itemId;

        } catch (error) {
            console.error('Error agregando item:', error);
            throw error;
        }
    }

    async marcarItemTarea(tareaId, itemId, completado, usuarioActual, organizacionCamelCase) {
        try {
            const tarea = await this.getTareaById(tareaId, organizacionCamelCase);
            if (!tarea) throw new Error('Tarea no encontrada');

            tarea.marcarItem(itemId, completado);

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const tareaRef = doc(db, collectionName, tareaId);

            // [MODIFICACIÓN]: Registrar ACTUALIZACIÓN
            await consumo.registrarFirestoreActualizacion(collectionName, tareaId);
            
            await updateDoc(tareaRef, {
                items: tarea.items,
                fechaActualizacion: serverTimestamp(),
                actualizadoPor: usuarioActual.id,
                actualizadoPorNombre: usuarioActual.nombreCompleto || usuarioActual.email || 'Usuario'
            });

            return true;

        } catch (error) {
            console.error('Error marcando item:', error);
            throw error;
        }
    }

    async eliminarItemTarea(tareaId, itemId, usuarioActual, organizacionCamelCase) {
        try {
            const tarea = await this.getTareaById(tareaId, organizacionCamelCase);
            if (!tarea) throw new Error('Tarea no encontrada');

            // Verificar permisos
            if (!tarea.puedeEditar(usuarioActual.id, usuarioActual.esAdmin)) {
                throw new Error('No tienes permiso para modificar esta tarea');
            }

            tarea.eliminarItem(itemId);

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const tareaRef = doc(db, collectionName, tareaId);

            // [MODIFICACIÓN]: Registrar ACTUALIZACIÓN
            await consumo.registrarFirestoreActualizacion(collectionName, tareaId);
            
            await updateDoc(tareaRef, {
                items: tarea.items,
                fechaActualizacion: serverTimestamp(),
                actualizadoPor: usuarioActual.id,
                actualizadoPorNombre: usuarioActual.nombreCompleto || usuarioActual.email || 'Usuario'
            });

            return true;

        } catch (error) {
            console.error('Error eliminando item:', error);
            throw error;
        }
    }

    async actualizarTarea(tareaId, nuevosDatos, usuarioActual, organizacionCamelCase) {
        try {
            const tarea = await this.getTareaById(tareaId, organizacionCamelCase);
            if (!tarea) throw new Error('Tarea no encontrada');

            // Verificar permisos
            if (!tarea.puedeEditar(usuarioActual.id, usuarioActual.esAdmin)) {
                throw new Error('No tienes permiso para modificar esta tarea');
            }

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const tareaRef = doc(db, collectionName, tareaId);

            const datosActualizados = {
                ...nuevosDatos,
                fechaActualizacion: serverTimestamp(),
                actualizadoPor: usuarioActual.id,
                actualizadoPorNombre: usuarioActual.nombreCompleto || usuarioActual.email || 'Usuario'
            };

            // Procesar fecha límite si existe
            if (nuevosDatos.fechaLimite) {
                datosActualizados.fechaLimite = this._procesarFecha(nuevosDatos.fechaLimite);
            }

            delete datosActualizados.id;
            delete datosActualizados.organizacionCamelCase;
            delete datosActualizados.fechaCreacion;
            delete datosActualizados.creadoPor;
            delete datosActualizados.creadoPorNombre;

            // [MODIFICACIÓN]: Registrar ACTUALIZACIÓN
            await consumo.registrarFirestoreActualizacion(collectionName, tareaId);
            
            await updateDoc(tareaRef, datosActualizados);
            return true;

        } catch (error) {
            console.error('Error actualizando tarea:', error);
            throw error;
        }
    }

    async eliminarTarea(tareaId, usuarioActual, organizacionCamelCase) {
        try {
            const tarea = await this.getTareaById(tareaId, organizacionCamelCase);
            if (!tarea) throw new Error('Tarea no encontrada');

            // Verificar permisos
            if (!tarea.puedeEditar(usuarioActual.id, usuarioActual.esAdmin)) {
                throw new Error('No tienes permiso para eliminar esta tarea');
            }

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const tareaRef = doc(db, collectionName, tareaId);
            
            // [MODIFICACIÓN]: Registrar ELIMINACIÓN
            await consumo.registrarFirestoreEliminacion(collectionName, tareaId);
            
            await deleteDoc(tareaRef);

            // Remover de la caché local
            this.tareas = this.tareas.filter(t => t.id !== tareaId);

            return true;

        } catch (error) {
            console.error('Error eliminando tarea:', error);
            throw error;
        }
    }

    async marcarItemTareaConAutor(tareaId, itemId, completado, marcadoPor, marcadoPorNombre, usuarioActual, organizacionCamelCase) {
        try {
            const tarea = await this.getTareaById(tareaId, organizacionCamelCase);
            if (!tarea) throw new Error('Tarea no encontrada');

            // Verificar que el item existe
            if (!tarea.items[itemId]) throw new Error('Item no encontrado');

            // Actualizar el item
            tarea.items[itemId].completado = completado;
            tarea.items[itemId].marcadoPor = marcadoPor;
            tarea.items[itemId].marcadoPorNombre = marcadoPorNombre;
            tarea.items[itemId].fechaModificacion = new Date().toISOString();

            tarea._calcularProgreso();

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const tareaRef = doc(db, collectionName, tareaId);

            await consumo.registrarFirestoreActualizacion(collectionName, tareaId);
            
            await updateDoc(tareaRef, {
                items: tarea.items,
                fechaActualizacion: serverTimestamp(),
                actualizadoPor: usuarioActual.id,
                actualizadoPorNombre: usuarioActual.nombreCompleto || usuarioActual.email || 'Usuario'
            });

            return true;

        } catch (error) {
            console.error('Error marcando item con autor:', error);
            throw error;
        }
    }


    async marcarItemTareaConAutor(tareaId, itemId, completado, marcadoPor, marcadoPorNombre, usuarioActual, organizacionCamelCase) {
        try {
            const tarea = await this.getTareaById(tareaId, organizacionCamelCase);
            if (!tarea) throw new Error('Tarea no encontrada');

            if (!tarea.items[itemId]) throw new Error('Item no encontrado');

            tarea.items[itemId].completado = completado;
            tarea.items[itemId].marcadoPor = marcadoPor;
            tarea.items[itemId].marcadoPorNombre = marcadoPorNombre;
            tarea.items[itemId].fechaModificacion = new Date().toISOString();

            tarea._calcularProgreso();

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const tareaRef = doc(db, collectionName, tareaId);

            await consumo.registrarFirestoreActualizacion(collectionName, tareaId);

            await updateDoc(tareaRef, {
                items: tarea.items,
                fechaActualizacion: serverTimestamp(),
                actualizadoPor: usuarioActual.id,
                actualizadoPorNombre: usuarioActual.nombreCompleto || usuarioActual.email || 'Usuario'
            });

            return true;

        } catch (error) {
            console.error('Error marcando item con autor:', error);
            throw error;
        }
    }
}

export { Tarea, TareaManager };