// area.js - VERSIÓN CORREGIDA (Preserva estado de cargos al actualizar)

import {
    collection,
    doc,
    getDocs,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    serverTimestamp,
    addDoc,
    orderBy,
    Timestamp
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

import { db } from '/config/firebase-config.js';
import consumo from '/clases/consumoFirebase.js';

/**
 * Clase Area - Representa un área con sus cargos
 */
class Area {
    constructor(id, data) {
        this.id = id;
        this.nombreArea = data.nombreArea || '';
        this.descripcion = data.descripcion || '';
        this.caracteristicas = data.caracteristicas || '';

        // Objeto que contiene los cargos del área
        this.cargos = {};

        if (data.cargos) {
            if (typeof data.cargos === 'object') {
                this.cargos = JSON.parse(JSON.stringify(data.cargos));
            }
        }

        this.organizacionCamelCase = data.organizacionCamelCase || '';
        this.creadoPor = data.creadoPor || '';
        this.actualizadoPor = data.actualizadoPor || '';
        this.responsable = data.responsable || '';
        this.responsableNombre = data.responsableNombre || '';
        this.estado = data.estado || 'activa';

        this.fechaCreacion = data.fechaCreacion ? this._convertirFecha(data.fechaCreacion) : new Date();
        this.fechaActualizacion = data.fechaActualizacion ? this._convertirFecha(data.fechaActualizacion) : new Date();
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
        } catch {
            return 'Fecha inválida';
        }
    }

    getCantidadCargosActivos() {
        if (!this.cargos) return 0;
        return Object.values(this.cargos).filter(cargo => cargo.estado !== 'inactivo').length;
    }

    getCantidadCargosTotal() {
        return Object.keys(this.cargos || {}).length;
    }

    tieneCargosActivos() {
        return this.getCantidadCargosActivos() > 0;
    }

    getCargosAsArray() {
        const cargosArray = [];
        if (this.cargos) {
            Object.keys(this.cargos).forEach(id => {
                cargosArray.push({
                    id,
                    ...this.cargos[id]
                });
            });
        }
        return cargosArray;
    }

    getFechaCreacionFormateada() {
        return this._formatearFecha(this.fechaCreacion);
    }

    getFechaActualizacionFormateada() {
        return this._formatearFecha(this.fechaActualizacion);
    }

    getEstadoBadge() {
        if (this.estado === 'activa') {
            return '<span class="badge-activo"><i class="fas fa-check-circle"></i> Activa</span>';
        } else {
            return '<span class="badge-inactivo"><i class="fas fa-pause-circle"></i> Inactiva</span>';
        }
    }

    toFirestore() {
        return {
            nombreArea: this.nombreArea,
            descripcion: this.descripcion,
            caracteristicas: this.caracteristicas,
            cargos: this.cargos || {},
            organizacionCamelCase: this.organizacionCamelCase,
            creadoPor: this.creadoPor,
            actualizadoPor: this.actualizadoPor,
            responsable: this.responsable || '',
            responsableNombre: this.responsableNombre || '',
            estado: this.estado || 'activa',
            fechaCreacion: this.fechaCreacion,
            fechaActualizacion: this.fechaActualizacion
        };
    }

    toUI() {
        return {
            id: this.id,
            nombreArea: this.nombreArea,
            descripcion: this.descripcion,
            caracteristicas: this.caracteristicas,
            totalCargos: this.getCantidadCargosTotal(),
            cargosActivos: this.getCantidadCargosActivos(),
            tieneCargosActivos: this.tieneCargosActivos(),
            cargos: this.getCargosAsArray(),
            fechaCreacion: this.getFechaCreacionFormateada(),
            fechaActualizacion: this.getFechaActualizacionFormateada(),
            creadoPor: this.creadoPor,
            responsable: this.responsable,
            responsableNombre: this.responsableNombre,
            estado: this.estado,
            estadoBadge: this.getEstadoBadge(),
            organizacionCamelCase: this.organizacionCamelCase
        };
    }
}

/**
 * Clase AreaManager - Gestiona las operaciones CRUD de áreas
 */
class AreaManager {
    constructor() {
        this.areas = [];
        this.historialManager = null;
        this.notificacionManager = null;
    }

    _getCollectionName(organizacionCamelCase) {
        return `areas_${organizacionCamelCase}`;
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

    async _getNotificacionManager() {
        if (!this.notificacionManager) {
            try {
                const { NotificacionAreaManager } = await import('/clases/notificacionArea.js');
                this.notificacionManager = new NotificacionAreaManager();
            } catch (error) {
                console.error('Error inicializando notificacionManager:', error);
            }
        }
        return this.notificacionManager;
    }

    _generarIdFirebase() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let id = '';
        for (let i = 0; i < 20; i++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return id;
    }

    async crearArea(areaData, userManager) {
        try {
            const usuarioActual = userManager.currentUser;

            if (!usuarioActual || !usuarioActual.organizacionCamelCase) {
                throw new Error('Usuario no tiene organización asignada');
            }

            const organizacion = usuarioActual.organizacionCamelCase;
            const collectionName = this._getCollectionName(organizacion);

            await consumo.registrarFirestoreLectura(collectionName, 'verificar nombre');
            const existe = await this.verificarAreaExistente(areaData.nombreArea, organizacion);
            if (existe) throw new Error('Ya existe un área con ese nombre');

            const cargosConIdsFirebase = {};

            if (areaData.cargos && typeof areaData.cargos === 'object') {
                Object.keys(areaData.cargos).forEach(key => {
                    const cargo = areaData.cargos[key];
                    const cargoId = this._generarIdFirebase();
                    cargosConIdsFirebase[cargoId] = {
                        nombre: cargo.nombre || '',
                        descripcion: cargo.descripcion || '',
                        estado: 'activo'
                    };
                });
            }

            const areasCollection = collection(db, collectionName);

            const areaFirestoreData = {
                nombreArea: areaData.nombreArea,
                descripcion: areaData.descripcion || '',
                caracteristicas: areaData.caracteristicas || '',
                cargos: cargosConIdsFirebase,
                organizacionCamelCase: organizacion,
                creadoPor: usuarioActual.id,
                actualizadoPor: usuarioActual.id,
                responsable: areaData.responsable || '',
                responsableNombre: areaData.responsableNombre || '',
                estado: 'activa',
                fechaCreacion: serverTimestamp(),
                fechaActualizacion: serverTimestamp()
            };

            await consumo.registrarFirestoreEscritura(collectionName, 'nueva área');
            const docRef = await addDoc(areasCollection, areaFirestoreData);

            const nuevaArea = new Area(docRef.id, {
                ...areaFirestoreData,
                fechaCreacion: new Date(),
                fechaActualizacion: new Date()
            });

            this.areas.unshift(nuevaArea);

            const historial = await this._getHistorialManager();
            if (historial) {
                await historial.registrarActividad({
                    usuario: usuarioActual,
                    tipo: 'crear',
                    modulo: 'areas',
                    descripcion: historial.generarDescripcion('crear', 'areas', {
                        nombre: areaData.nombreArea,
                        totalCargos: Object.keys(cargosConIdsFirebase).length
                    }),
                    detalles: {
                        areaId: docRef.id,
                        nombre: areaData.nombreArea,
                        totalCargos: Object.keys(cargosConIdsFirebase).length,
                        responsable: areaData.responsableNombre || 'No asignado'
                    }
                });
            }

            return nuevaArea;

        } catch (error) {
            console.error('Error creando área:', error);
            throw error;
        }
    }

    // ========== MÉTODO CORREGIDO: Preserva el estado de los cargos ==========
    async actualizarArea(areaId, nuevosDatos, usuarioId, organizacionCamelCase, usuarioActual = null) {
        try {
            if (!organizacionCamelCase) {
                throw new Error('Se requiere organización para actualizar área');
            }

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const areaRef = doc(db, collectionName, areaId);

            await consumo.registrarFirestoreLectura(collectionName, areaId);
            const areaSnap = await getDoc(areaRef);

            if (!areaSnap.exists()) {
                throw new Error(`Área con ID ${areaId} no encontrada`);
            }

            const datosActuales = areaSnap.data();

            let cargosActualizados = {};

            if (nuevosDatos.cargos) {
                // 1. Copiar TODOS los cargos existentes con sus estados ORIGINALES
                if (datosActuales.cargos) {
                    Object.keys(datosActuales.cargos).forEach(id => {
                        cargosActualizados[id] = { ...datosActuales.cargos[id] };
                    });
                }

                // 2. Actualizar los cargos que vienen del formulario
                Object.keys(nuevosDatos.cargos).forEach(key => {
                    const cargoNuevo = nuevosDatos.cargos[key];

                    if (cargosActualizados[key]) {
                        // Cargo existe - actualizar nombre/descripción, PRESERVAR EL ESTADO
                        cargosActualizados[key] = {
                            ...cargosActualizados[key],
                            nombre: cargoNuevo.nombre || '',
                            descripcion: cargoNuevo.descripcion || '',
                            estado: cargoNuevo.estado !== undefined ? cargoNuevo.estado : (cargosActualizados[key].estado || 'activo')
                        };
                    } else {
                        // Cargo nuevo
                        cargosActualizados[key] = {
                            nombre: cargoNuevo.nombre || '',
                            descripcion: cargoNuevo.descripcion || '',
                            estado: cargoNuevo.estado || 'activo'
                        };
                    }
                });
            } else {
                cargosActualizados = datosActuales.cargos || {};
            }

            const datosActualizados = {
                nombreArea: nuevosDatos.nombreArea,
                descripcion: nuevosDatos.descripcion,
                cargos: cargosActualizados,
                responsable: nuevosDatos.responsable || datosActuales.responsable,
                responsableNombre: nuevosDatos.responsableNombre || datosActuales.responsableNombre,
                fechaActualizacion: serverTimestamp(),
                actualizadoPor: usuarioId
            };

            await consumo.registrarFirestoreActualizacion(collectionName, areaId);
            await updateDoc(areaRef, datosActualizados);

            const areaIndex = this.areas.findIndex(a => a.id === areaId);
            if (areaIndex !== -1) {
                const areaActual = this.areas[areaIndex];
                Object.keys(datosActualizados).forEach(key => {
                    if (key !== 'id') {
                        areaActual[key] = datosActualizados[key];
                    }
                });
                areaActual.fechaActualizacion = new Date();
                areaActual.actualizadoPor = usuarioId;
            }

            if (usuarioActual) {
                const historial = await this._getHistorialManager();
                if (historial) {
                    const cambios = [];
                    if (datosActuales.nombreArea !== nuevosDatos.nombreArea) {
                        cambios.push(`nombre: "${datosActuales.nombreArea}" → "${nuevosDatos.nombreArea}"`);
                    }
                    if (datosActuales.responsableNombre !== nuevosDatos.responsableNombre) {
                        cambios.push(`responsable: ${datosActuales.responsableNombre || 'Ninguno'} → ${nuevosDatos.responsableNombre || 'Ninguno'}`);
                    }

                    await historial.registrarActividad({
                        usuario: usuarioActual,
                        tipo: 'editar',
                        modulo: 'areas',
                        descripcion: historial.generarDescripcion('editar', 'areas', {
                            nombre: nuevosDatos.nombreArea,
                            nombreOriginal: datosActuales.nombreArea,
                            cambios: cambios.join(', ')
                        }),
                        detalles: {
                            areaId,
                            nombre: nuevosDatos.nombreArea,
                            nombreOriginal: datosActuales.nombreArea,
                            totalCargos: Object.keys(cargosActualizados).length,
                            cambios
                        }
                    });
                }
            }

            return await this.getAreaById(areaId, organizacionCamelCase);

        } catch (error) {
            console.error('Error actualizando área:', error);
            throw error;
        }
    }

    async getAreasByOrganizacion(organizacionCamelCase, soloActivas = false, usuarioActual = null) {
        try {
            if (!organizacionCamelCase) return [];

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const areasCollection = collection(db, collectionName);

            let areasQuery;
            if (soloActivas) {
                areasQuery = query(
                    areasCollection,
                    where("organizacionCamelCase", "==", organizacionCamelCase),
                    where("estado", "==", "activa"),
                    orderBy("fechaCreacion", "desc")
                );
            } else {
                areasQuery = query(
                    areasCollection,
                    where("organizacionCamelCase", "==", organizacionCamelCase),
                    orderBy("fechaCreacion", "desc")
                );
            }

            await consumo.registrarFirestoreLectura(collectionName, 'lista áreas');
            const areasSnapshot = await getDocs(areasQuery);
            const areas = [];

            areasSnapshot.forEach(doc => {
                try {
                    const data = doc.data();
                    const area = new Area(doc.id, { ...data, id: doc.id });
                    areas.push(area);
                } catch (error) {
                    console.error('Error procesando área:', error);
                }
            });

            this.areas = areas;

            if (usuarioActual) {
                const historial = await this._getHistorialManager();
                if (historial) {
                    await historial.registrarActividad({
                        usuario: usuarioActual,
                        tipo: 'leer',
                        modulo: 'areas',
                        descripcion: `Consultó lista de áreas (${areas.length} áreas)`,
                        detalles: { total: areas.length }
                    });
                }
            }

            return areas;

        } catch (error) {
            console.error('Error obteniendo áreas:', error);
            return [];
        }
    }

    async getAreasByResponsable(responsableId, organizacionCamelCase) {
        try {
            if (!organizacionCamelCase || !responsableId) return [];

            const collectionName = this._getCollectionName(organizacionCamelCase);

            const q = query(
                collection(db, collectionName),
                where("responsable", "==", responsableId),
                where("estado", "==", "activa"),
                orderBy("fechaCreacion", "desc")
            );

            await consumo.registrarFirestoreLectura(collectionName, 'áreas por responsable');
            const snapshot = await getDocs(q);
            const areas = [];

            snapshot.forEach(doc => {
                areas.push(new Area(doc.id, doc.data()));
            });

            return areas;

        } catch (error) {
            console.error('Error obteniendo áreas por responsable:', error);
            return [];
        }
    }

    async getAreaById(areaId, organizacionCamelCase) {
        if (!organizacionCamelCase) return null;

        const areaInMemory = this.areas.find(area => area.id === areaId);
        if (areaInMemory) return areaInMemory;

        try {
            const collectionName = this._getCollectionName(organizacionCamelCase);
            const areaRef = doc(db, collectionName, areaId);

            await consumo.registrarFirestoreLectura(collectionName, areaId);
            const areaSnap = await getDoc(areaRef);

            if (areaSnap.exists()) {
                const data = areaSnap.data();
                const area = new Area(areaId, { ...data, id: areaId });
                this.areas.push(area);
                return area;
            }
            return null;

        } catch (error) {
            console.error('Error obteniendo área:', error);
            return null;
        }
    }

    async inactivarCargo(areaId, cargoId, usuarioId, organizacionCamelCase, usuarioActual = null) {
        try {
            if (!organizacionCamelCase) {
                throw new Error('Se requiere organización para inactivar cargo');
            }

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const areaRef = doc(db, collectionName, areaId);

            await consumo.registrarFirestoreLectura(collectionName, areaId);
            const areaSnap = await getDoc(areaRef);

            if (!areaSnap.exists()) {
                throw new Error(`Área con ID ${areaId} no encontrada`);
            }

            const datosActuales = areaSnap.data();
            const cargos = datosActuales.cargos || {};

            if (!cargos[cargoId]) {
                throw new Error('Cargo no encontrado');
            }

            const nombreCargo = cargos[cargoId].nombre;

            cargos[cargoId] = {
                ...cargos[cargoId],
                estado: 'inactivo'
            };

            await consumo.registrarFirestoreActualizacion(collectionName, areaId);
            await updateDoc(areaRef, {
                cargos: cargos,
                fechaActualizacion: serverTimestamp(),
                actualizadoPor: usuarioId
            });

            if (usuarioActual) {
                const historial = await this._getHistorialManager();
                if (historial) {
                    await historial.registrarActividad({
                        usuario: usuarioActual,
                        tipo: 'editar',
                        modulo: 'areas',
                        descripcion: `Inactivó cargo "${nombreCargo}" en área "${datosActuales.nombreArea}"`,
                        detalles: {
                            areaId,
                            areaNombre: datosActuales.nombreArea,
                            cargoId,
                            cargoNombre: nombreCargo,
                            nuevoEstado: 'inactivo'
                        }
                    });
                }
            }

            return true;

        } catch (error) {
            console.error('Error inactivando cargo:', error);
            throw error;
        }
    }

    async reactivarCargo(areaId, cargoId, usuarioId, organizacionCamelCase, usuarioActual = null) {
        try {
            if (!organizacionCamelCase) {
                throw new Error('Se requiere organización para reactivar cargo');
            }

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const areaRef = doc(db, collectionName, areaId);

            await consumo.registrarFirestoreLectura(collectionName, areaId);
            const areaSnap = await getDoc(areaRef);

            if (!areaSnap.exists()) {
                throw new Error(`Área con ID ${areaId} no encontrada`);
            }

            const datosActuales = areaSnap.data();
            const cargos = datosActuales.cargos || {};

            if (!cargos[cargoId]) {
                throw new Error('Cargo no encontrado');
            }

            const nombreCargo = cargos[cargoId].nombre;

            cargos[cargoId] = {
                ...cargos[cargoId],
                estado: 'activo'
            };

            await consumo.registrarFirestoreActualizacion(collectionName, areaId);
            await updateDoc(areaRef, {
                cargos: cargos,
                fechaActualizacion: serverTimestamp(),
                actualizadoPor: usuarioId
            });

            if (usuarioActual) {
                const historial = await this._getHistorialManager();
                if (historial) {
                    await historial.registrarActividad({
                        usuario: usuarioActual,
                        tipo: 'editar',
                        modulo: 'areas',
                        descripcion: `Reactivó cargo "${nombreCargo}" en área "${datosActuales.nombreArea}"`,
                        detalles: {
                            areaId,
                            areaNombre: datosActuales.nombreArea,
                            cargoId,
                            cargoNombre: nombreCargo,
                            nuevoEstado: 'activo'
                        }
                    });
                }
            }

            return true;

        } catch (error) {
            console.error('Error reactivando cargo:', error);
            throw error;
        }
    }

    async inactivarArea(areaId, usuarioId, organizacionCamelCase, usuarioActual = null) {
        try {
            if (!organizacionCamelCase) {
                throw new Error('Se requiere organización para inactivar área');
            }

            const area = await this.getAreaById(areaId, organizacionCamelCase);
            const nombreArea = area ? area.nombreArea : 'Área desconocida';

            if (area && area.tieneCargosActivos()) {
                throw new Error('No se puede inactivar un área con cargos activos. Debe inactivar todos los cargos primero.');
            }

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const areaRef = doc(db, collectionName, areaId);

            await consumo.registrarFirestoreActualizacion(collectionName, areaId);
            await updateDoc(areaRef, {
                estado: 'inactiva',
                fechaActualizacion: serverTimestamp(),
                actualizadoPor: usuarioId
            });

            const areaIndex = this.areas.findIndex(a => a.id === areaId);
            if (areaIndex !== -1) {
                this.areas[areaIndex].estado = 'inactiva';
                this.areas[areaIndex].fechaActualizacion = new Date();
                this.areas[areaIndex].actualizadoPor = usuarioId;
            }

            if (usuarioActual) {
                const historial = await this._getHistorialManager();
                if (historial) {
                    await historial.registrarActividad({
                        usuario: usuarioActual,
                        tipo: 'editar',
                        modulo: 'areas',
                        descripcion: `Inactivó área "${nombreArea}"`,
                        detalles: {
                            areaId,
                            nombre: nombreArea,
                            nuevoEstado: 'inactiva'
                        }
                    });
                }
            }

            return true;

        } catch (error) {
            console.error('Error inactivando área:', error);
            throw error;
        }
    }

    async reactivarArea(areaId, usuarioId, organizacionCamelCase, usuarioActual = null) {
        try {
            if (!organizacionCamelCase) {
                throw new Error('Se requiere organización para reactivar área');
            }

            const area = await this.getAreaById(areaId, organizacionCamelCase);
            const nombreArea = area ? area.nombreArea : 'Área desconocida';

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const areaRef = doc(db, collectionName, areaId);

            await consumo.registrarFirestoreActualizacion(collectionName, areaId);
            await updateDoc(areaRef, {
                estado: 'activa',
                fechaActualizacion: serverTimestamp(),
                actualizadoPor: usuarioId
            });

            const areaIndex = this.areas.findIndex(a => a.id === areaId);
            if (areaIndex !== -1) {
                this.areas[areaIndex].estado = 'activa';
                this.areas[areaIndex].fechaActualizacion = new Date();
                this.areas[areaIndex].actualizadoPor = usuarioId;
            }

            if (usuarioActual) {
                const historial = await this._getHistorialManager();
                if (historial) {
                    await historial.registrarActividad({
                        usuario: usuarioActual,
                        tipo: 'editar',
                        modulo: 'areas',
                        descripcion: `Reactivó área "${nombreArea}"`,
                        detalles: {
                            areaId,
                            nombre: nombreArea,
                            nuevoEstado: 'activa'
                        }
                    });
                }
            }

            return true;

        } catch (error) {
            console.error('Error reactivando área:', error);
            throw error;
        }
    }

    async verificarAreaExistente(nombreArea, organizacionCamelCase) {
        try {
            const collectionName = this._getCollectionName(organizacionCamelCase);

            const q = query(
                collection(db, collectionName),
                where("nombreArea", "==", nombreArea),
                where("organizacionCamelCase", "==", organizacionCamelCase)
            );

            await consumo.registrarFirestoreLectura(collectionName, 'verificar nombre');
            const querySnapshot = await getDocs(q);
            return !querySnapshot.empty;

        } catch (error) {
            console.error('Error verificando área:', error);
            return false;
        }
    }

    async getEstadisticas(organizacionCamelCase) {
        try {
            if (!organizacionCamelCase) {
                return { total: 0, activas: 0, inactivas: 0 };
            }

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const areasCollection = collection(db, collectionName);

            await consumo.registrarFirestoreLectura(collectionName, 'estadísticas');
            const snapshot = await getDocs(areasCollection);

            let total = 0;
            let activas = 0;

            snapshot.forEach(doc => {
                total++;
                const data = doc.data();
                if (data.estado === 'activa') activas++;
            });

            return {
                total,
                activas,
                inactivas: total - activas
            };

        } catch (error) {
            console.error('Error obteniendo estadísticas:', error);
            return { total: 0, activas: 0, inactivas: 0 };
        }
    }
}

export { Area, AreaManager };