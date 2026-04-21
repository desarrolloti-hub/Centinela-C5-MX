// riesgoNivel.js - CLASE COMPLETA CON PAGINACIÓN PARA NIVELES DE RIESGO
// Basado en incidencia.js

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
    orderBy,
    limit,
    startAfter,
    getCountFromServer,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

import { db } from '/config/firebase-config.js';
import consumo from '/clases/consumoFirebase.js';

class RiesgoNivel {
    constructor(id, data) {
        this.id = id || '';
        this.nombre = data.nombre || '';
        this.color = data.color || '#ffffff';
        this.organizacionCamelCase = data.organizacionCamelCase || '';
        this.creadoPor = data.creadoPor || '';
        this.creadoPorNombre = data.creadoPorNombre || '';
        this.actualizadoPor = data.actualizadoPor || '';
        this.actualizadoPorNombre = data.actualizadoPorNombre || '';
        this.fechaCreacion = data.fechaCreacion ? this._convertirFecha(data.fechaCreacion) : new Date();
        this.fechaActualizacion = data.fechaActualizacion ? this._convertirFecha(data.fechaActualizacion) : new Date();
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

    _formatearFecha(fecha) {
        if (!fecha) return 'No disponible';
        try {
            const date = this._convertirFecha(fecha);
            return date.toLocaleDateString('es-MX', {
                year: 'numeric', month: 'long', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        } catch {
            return 'Fecha inválida';
        }
    }

    getFechaCreacionFormateada() {
        return this._formatearFecha(this.fechaCreacion);
    }

    getFechaActualizacionFormateada() {
        return this._formatearFecha(this.fechaActualizacion);
    }

    toJSON() {
        return {
            id: this.id,
            nombre: this.nombre,
            color: this.color,
            organizacionCamelCase: this.organizacionCamelCase,
            creadoPor: this.creadoPor,
            creadoPorNombre: this.creadoPorNombre,
            actualizadoPor: this.actualizadoPor,
            actualizadoPorNombre: this.actualizadoPorNombre,
            fechaCreacion: this.fechaCreacion,
            fechaActualizacion: this.fechaActualizacion
        };
    }

    toUI() {
        return {
            id: this.id,
            nombre: this.nombre,
            color: this.color,
            colorCSS: this.color,
            organizacionCamelCase: this.organizacionCamelCase,
            fechaCreacion: this.getFechaCreacionFormateada(),
            fechaActualizacion: this.getFechaActualizacionFormateada(),
            creadoPorNombre: this.creadoPorNombre,
            actualizadoPorNombre: this.actualizadoPorNombre
        };
    }
}

class RiesgoNivelManager {
    constructor() {
        this.niveles = [];
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
        return `nivelesRiesgo_${organizacionCamelCase}`;
    }

    _generarIdDesdeNombre(nombre) {
        if (!nombre) return `nivel_${Date.now()}`;
        return nombre
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    }

    async contarTotalNiveles(organizacionCamelCase, filtros = {}) {
        try {
            const collectionName = this._getCollectionName(organizacionCamelCase);
            const collectionRef = collection(db, collectionName);
            
            let constraints = [];
            if (filtros.nombre && filtros.nombre !== '') {
                constraints.push(where("nombre", ">=", filtros.nombre));
                constraints.push(where("nombre", "<=", filtros.nombre + '\uf8ff'));
            }
            
            const q = query(collectionRef, ...constraints);
            await consumo.registrarFirestoreLectura(collectionName, 'conteo niveles');
            const snapshot = await getCountFromServer(q);
            return snapshot.data().count;
        } catch (error) {
            console.error('Error contando niveles:', error);
            return 0;
        }
    }

    async getNivelesPaginados(organizacionCamelCase, filtros = {}, pagina = 1, itemsPorPagina = 10, cursores = null) {
        try {
            if (!organizacionCamelCase) throw new Error('Organización no especificada');

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const collectionRef = collection(db, collectionName);
            
            let constraints = [orderBy("nombre", "asc")];
            
            if (filtros.nombre && filtros.nombre !== '') {
                constraints.push(where("nombre", ">=", filtros.nombre));
                constraints.push(where("nombre", "<=", filtros.nombre + '\uf8ff'));
            }
            
            if (pagina > 1 && cursores?.ultimoDocumento) {
                constraints.push(startAfter(cursores.ultimoDocumento));
            }
            constraints.push(limit(itemsPorPagina));
            
            const q = query(collectionRef, ...constraints);
            await consumo.registrarFirestoreLectura(collectionName, `página ${pagina}`);
            const snapshot = await getDocs(q);
            
            const niveles = [];
            let ultimoDoc = null;
            let primerDoc = null;
            
            if (!snapshot.empty) {
                ultimoDoc = snapshot.docs[snapshot.docs.length - 1];
                primerDoc = snapshot.docs[0];
                snapshot.forEach(doc => {
                    try {
                        const data = doc.data();
                        const nivel = new RiesgoNivel(doc.id, {
                            ...data,
                            fechaCreacion: data.fechaCreacion?.toDate?.() || data.fechaCreacion,
                            fechaActualizacion: data.fechaActualizacion?.toDate?.() || data.fechaActualizacion
                        });
                        niveles.push(nivel);
                    } catch (error) {
                        console.error('Error procesando nivel:', error);
                    }
                });
            }
            
            const total = await this.contarTotalNiveles(organizacionCamelCase, filtros);
            
            return {
                niveles,
                total,
                paginaActual: pagina,
                totalPaginas: Math.ceil(total / itemsPorPagina),
                ultimoDocumento: ultimoDoc,
                primerDocumento: primerDoc,
                tieneMas: snapshot.docs.length === itemsPorPagina
            };
        } catch (error) {
            console.error('Error obteniendo niveles paginados:', error);
            return {
                niveles: [],
                total: 0,
                paginaActual: pagina,
                totalPaginas: 0,
                ultimoDocumento: null,
                primerDocumento: null,
                tieneMas: false
            };
        }
    }

    async crearNivel(data, usuarioActual) {
        try {
            if (!usuarioActual || !usuarioActual.organizacionCamelCase) {
                throw new Error('Usuario no tiene organización asignada');
            }
            if (!data.nombre || data.nombre.trim() === '') {
                throw new Error('El nombre del nivel de riesgo es obligatorio');
            }
            
            const organizacion = usuarioActual.organizacionCamelCase;
            const collectionName = this._getCollectionName(organizacion);
            const collectionRef = collection(db, collectionName);
            
            const nivelId = this._generarIdDesdeNombre(data.nombre);
            const nivelRef = doc(collectionRef, nivelId);
            
            // Verificar si ya existe
            const existDoc = await getDoc(nivelRef);
            if (existDoc.exists()) {
                throw new Error(`Ya existe un nivel de riesgo con el nombre "${data.nombre}" (ID: ${nivelId})`);
            }
            
            const nivelData = {
                nombre: data.nombre.trim(),
                color: data.color || '#ffffff',
                organizacionCamelCase: organizacion,
                creadoPor: usuarioActual.id,
                creadoPorNombre: usuarioActual.nombreCompleto || '',
                actualizadoPor: usuarioActual.id,
                actualizadoPorNombre: usuarioActual.nombreCompleto || '',
                fechaCreacion: serverTimestamp(),
                fechaActualizacion: serverTimestamp()
            };
            
            await consumo.registrarFirestoreEscritura(collectionName, nivelId);
            await setDoc(nivelRef, nivelData);
            
            const nuevoNivel = new RiesgoNivel(nivelId, {
                ...nivelData,
                fechaCreacion: new Date(),
                fechaActualizacion: new Date()
            });
            
            this.niveles.unshift(nuevoNivel);
            
            const historial = await this._getHistorialManager();
            if (historial) {
                await historial.registrarActividad({
                    usuario: usuarioActual,
                    tipo: 'crear',
                    modulo: 'riesgoNivel',
                    descripcion: `Creó nivel de riesgo "${data.nombre}" (${nivelId})`,
                    detalles: { nivelId, nombre: data.nombre, color: data.color }
                });
            }
            
            return nuevoNivel;
        } catch (error) {
            console.error('Error creando nivel de riesgo:', error);
            throw error;
        }
    }

    async actualizarNivel(nivelId, nuevosDatos, usuarioActual, organizacionCamelCase) {
        try {
            if (!organizacionCamelCase) throw new Error('Organización no especificada');
            
            const collectionName = this._getCollectionName(organizacionCamelCase);
            const nivelRef = doc(db, collectionName, nivelId);
            
            const nivelSnap = await getDoc(nivelRef);
            if (!nivelSnap.exists()) throw new Error('Nivel de riesgo no encontrado');
            
            const datosActualizar = {
                ...nuevosDatos,
                fechaActualizacion: serverTimestamp(),
                actualizadoPor: usuarioActual.id,
                actualizadoPorNombre: usuarioActual.nombreCompleto || ''
            };
            delete datosActualizar.id;
            delete datosActualizar.organizacionCamelCase;
            delete datosActualizar.fechaCreacion;
            
            await consumo.registrarFirestoreActualizacion(collectionName, nivelId);
            await updateDoc(nivelRef, datosActualizar);
            
            // Actualizar caché
            const index = this.niveles.findIndex(n => n.id === nivelId);
            if (index !== -1) {
                Object.assign(this.niveles[index], nuevosDatos);
                this.niveles[index].fechaActualizacion = new Date();
                this.niveles[index].actualizadoPor = usuarioActual.id;
                this.niveles[index].actualizadoPorNombre = usuarioActual.nombreCompleto;
            }
            
            const historial = await this._getHistorialManager();
            if (historial) {
                await historial.registrarActividad({
                    usuario: usuarioActual,
                    tipo: 'editar',
                    modulo: 'riesgoNivel',
                    descripcion: `Actualizó nivel de riesgo "${nuevosDatos.nombre || nivelId}"`,
                    detalles: { nivelId, cambios: nuevosDatos }
                });
            }
            
            return true;
        } catch (error) {
            console.error('Error actualizando nivel:', error);
            throw error;
        }
    }

    async eliminarNivel(nivelId, usuarioActual, organizacionCamelCase) {
        try {
            if (!organizacionCamelCase) throw new Error('Organización no especificada');
            
            const collectionName = this._getCollectionName(organizacionCamelCase);
            const nivelRef = doc(db, collectionName, nivelId);
            
            const nivelSnap = await getDoc(nivelRef);
            if (!nivelSnap.exists()) throw new Error('Nivel de riesgo no encontrado');
            const nombreNivel = nivelSnap.data().nombre;
            
            await consumo.registrarFirestoreEliminacion(collectionName, nivelId);
            await deleteDoc(nivelRef);
            
            const index = this.niveles.findIndex(n => n.id === nivelId);
            if (index !== -1) this.niveles.splice(index, 1);
            
            const historial = await this._getHistorialManager();
            if (historial) {
                await historial.registrarActividad({
                    usuario: usuarioActual,
                    tipo: 'eliminar',
                    modulo: 'riesgoNivel',
                    descripcion: `Eliminó nivel de riesgo "${nombreNivel}" (${nivelId})`,
                    detalles: { nivelId, nombre: nombreNivel }
                });
            }
            
            return true;
        } catch (error) {
            console.error('Error eliminando nivel:', error);
            throw error;
        }
    }

    async obtenerNivelPorId(nivelId, organizacionCamelCase) {
        if (!organizacionCamelCase) return null;
        
        const cached = this.niveles.find(n => n.id === nivelId);
        if (cached) return cached;
        
        try {
            const collectionName = this._getCollectionName(organizacionCamelCase);
            const nivelRef = doc(db, collectionName, nivelId);
            await consumo.registrarFirestoreLectura(collectionName, nivelId);
            const snap = await getDoc(nivelRef);
            if (snap.exists()) {
                const data = snap.data();
                const nivel = new RiesgoNivel(nivelId, data);
                this.niveles.push(nivel);
                return nivel;
            }
            return null;
        } catch (error) {
            console.error('Error obteniendo nivel:', error);
            return null;
        }
    }

    async obtenerTodosNiveles(organizacionCamelCase) {
        try {
            const collectionName = this._getCollectionName(organizacionCamelCase);
            const collectionRef = collection(db, collectionName);
            const q = query(collectionRef, orderBy("nombre", "asc"));
            await consumo.registrarFirestoreLectura(collectionName, 'todos');
            const snapshot = await getDocs(q);
            const niveles = [];
            snapshot.forEach(doc => {
                niveles.push(new RiesgoNivel(doc.id, doc.data()));
            });
            return niveles;
        } catch (error) {
            console.error('Error obteniendo todos los niveles:', error);
            return [];
        }
    }

    limpiarCache() {
        this.niveles = [];
    }
}

export { RiesgoNivel, RiesgoNivelManager };