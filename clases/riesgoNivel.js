// riesgoNivel.js - CLASE COMPLETA CON VALIDACIÓN DE NOMBRE ÚNICO
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
        this.id = id;
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
            fechaCreacion: this.getFechaCreacionFormateada()
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
        return nombre
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    }

    _normalizarNombre(nombre) {
        return nombre
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim();
    }

    /**
     * Verifica si ya existe un nivel con el mismo nombre (ignorando mayúsculas, minúsculas y acentos)
     * @param {string} organizacionCamelCase 
     * @param {string} nombre 
     * @param {string} excludeId - ID a excluir (para edición)
     * @returns {Promise<boolean>}
     */
    async existeNombre(organizacionCamelCase, nombre, excludeId = null) {
        try {
            const collectionName = this._getCollectionName(organizacionCamelCase);
            const colRef = collection(db, collectionName);
            const nombreNormalizado = this._normalizarNombre(nombre);
            
            // Traer todos los documentos (podría optimizarse con un índice, pero para pocos niveles es suficiente)
            const q = query(colRef);
            const snapshot = await getDocs(q);
            let existe = false;
            snapshot.forEach(doc => {
                if (excludeId && doc.id === excludeId) return;
                const data = doc.data();
                const nombreDoc = this._normalizarNombre(data.nombre || '');
                if (nombreDoc === nombreNormalizado) {
                    existe = true;
                }
            });
            return existe;
        } catch (error) {
            console.error('Error verificando existencia de nombre:', error);
            return false;
        }
    }

    async contarTotalNiveles(organizacionCamelCase, filtros = {}) {
        try {
            const collectionName = this._getCollectionName(organizacionCamelCase);
            const colRef = collection(db, collectionName);
            let constraints = [];
            if (filtros.nombre && filtros.nombre !== '') {
                constraints.push(where("nombre", ">=", filtros.nombre));
                constraints.push(where("nombre", "<=", filtros.nombre + '\uf8ff'));
            }
            const q = query(colRef, ...constraints);
            await consumo.registrarFirestoreLectura(collectionName, 'conteo niveles riesgo');
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
            const colRef = collection(db, collectionName);
            let constraints = [orderBy("nombre", "asc")];

            if (filtros.nombre && filtros.nombre !== '') {
                constraints.push(where("nombre", ">=", filtros.nombre));
                constraints.push(where("nombre", "<=", filtros.nombre + '\uf8ff'));
            }

            if (pagina > 1 && cursores?.ultimoDocumento) {
                constraints.push(startAfter(cursores.ultimoDocumento));
            }
            constraints.push(limit(itemsPorPagina));

            const q = query(colRef, ...constraints);
            await consumo.registrarFirestoreLectura(collectionName, `página ${pagina}`);
            const snapshot = await getDocs(q);

            const niveles = [];
            let ultimoDoc = null;
            snapshot.forEach(doc => {
                ultimoDoc = doc;
                const data = doc.data();
                niveles.push(new RiesgoNivel(doc.id, data));
            });

            const total = await this.contarTotalNiveles(organizacionCamelCase, filtros);

            return {
                niveles,
                total,
                paginaActual: pagina,
                totalPaginas: Math.ceil(total / itemsPorPagina),
                ultimoDocumento: ultimoDoc,
                tieneMas: snapshot.docs.length === itemsPorPagina
            };
        } catch (error) {
            console.error('Error obteniendo niveles paginados:', error);
            return { niveles: [], total: 0, paginaActual: pagina, totalPaginas: 0, ultimoDocumento: null, tieneMas: false };
        }
    }

    async crearNivel(data, usuarioActual) {
        try {
            if (!usuarioActual || !usuarioActual.organizacionCamelCase) {
                throw new Error('Usuario sin organización');
            }
            const organizacion = usuarioActual.organizacionCamelCase;
            
            // Validar nombre único
            const existe = await this.existeNombre(organizacion, data.nombre);
            if (existe) {
                throw new Error(`Ya existe un nivel de riesgo con el nombre "${data.nombre}"`);
            }

            const collectionName = this._getCollectionName(organizacion);
            const colRef = collection(db, collectionName);

            const idGenerado = this._generarIdDesdeNombre(data.nombre);
            const docRef = doc(colRef, idGenerado);

            const ahora = serverTimestamp();
            const nivelData = {
                nombre: data.nombre,
                color: data.color,
                organizacionCamelCase: organizacion,
                creadoPor: usuarioActual.id,
                creadoPorNombre: usuarioActual.nombreCompleto || '',
                actualizadoPor: usuarioActual.id,
                actualizadoPorNombre: usuarioActual.nombreCompleto || '',
                fechaCreacion: ahora,
                fechaActualizacion: ahora
            };

            await consumo.registrarFirestoreEscritura(collectionName, idGenerado);
            await setDoc(docRef, nivelData);

            const nuevoNivel = new RiesgoNivel(idGenerado, { ...nivelData, fechaCreacion: new Date(), fechaActualizacion: new Date() });
            this.niveles.unshift(nuevoNivel);

            const historial = await this._getHistorialManager();
            if (historial) {
                await historial.registrarActividad({
                    usuario: usuarioActual,
                    tipo: 'crear',
                    modulo: 'nivelesRiesgo',
                    descripcion: `Creó nivel de riesgo "${data.nombre}" con color ${data.color}`,
                    detalles: { nivelId: idGenerado, nombre: data.nombre, color: data.color }
                });
            }
            return nuevoNivel;
        } catch (error) {
            console.error('Error creando nivel:', error);
            throw error;
        }
    }

    async actualizarNivel(id, datos, usuarioActual, organizacionCamelCase) {
        try {
            if (!organizacionCamelCase) throw new Error('Organización requerida');
            
            // Validar nombre único (excluyendo el mismo id)
            const existe = await this.existeNombre(organizacionCamelCase, datos.nombre, id);
            if (existe) {
                throw new Error(`Ya existe un nivel de riesgo con el nombre "${datos.nombre}"`);
            }

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const docRef = doc(db, collectionName, id);

            const datosActualizar = {
                nombre: datos.nombre,
                color: datos.color,
                actualizadoPor: usuarioActual.id,
                actualizadoPorNombre: usuarioActual.nombreCompleto || '',
                fechaActualizacion: serverTimestamp()
            };

            await consumo.registrarFirestoreActualizacion(collectionName, id);
            await updateDoc(docRef, datosActualizar);

            const index = this.niveles.findIndex(n => n.id === id);
            if (index !== -1) {
                this.niveles[index].nombre = datos.nombre;
                this.niveles[index].color = datos.color;
                this.niveles[index].fechaActualizacion = new Date();
                this.niveles[index].actualizadoPor = usuarioActual.id;
                this.niveles[index].actualizadoPorNombre = usuarioActual.nombreCompleto;
            }

            const historial = await this._getHistorialManager();
            if (historial) {
                await historial.registrarActividad({
                    usuario: usuarioActual,
                    tipo: 'editar',
                    modulo: 'nivelesRiesgo',
                    descripcion: `Editó nivel de riesgo "${datos.nombre}"`,
                    detalles: { nivelId: id, cambios: datos }
                });
            }
            return true;
        } catch (error) {
            console.error('Error actualizando nivel:', error);
            throw error;
        }
    }

    async eliminarNivel(id, organizacionCamelCase, usuarioActual) {
        try {
            if (!organizacionCamelCase) throw new Error('Organización requerida');
            const collectionName = this._getCollectionName(organizacionCamelCase);
            const docRef = doc(db, collectionName, id);

            const docSnap = await getDoc(docRef);
            const nombre = docSnap.exists() ? docSnap.data().nombre : id;

            await consumo.registrarFirestoreEliminacion(collectionName, id);
            await deleteDoc(docRef);

            this.niveles = this.niveles.filter(n => n.id !== id);

            const historial = await this._getHistorialManager();
            if (historial && usuarioActual) {
                await historial.registrarActividad({
                    usuario: usuarioActual,
                    tipo: 'eliminar',
                    modulo: 'nivelesRiesgo',
                    descripcion: `Eliminó nivel de riesgo "${nombre}"`,
                    detalles: { nivelId: id }
                });
            }
            return true;
        } catch (error) {
            console.error('Error eliminando nivel:', error);
            throw error;
        }
    }

    async obtenerNivelPorId(id, organizacionCamelCase) {
        if (!organizacionCamelCase) return null;
        const cached = this.niveles.find(n => n.id === id);
        if (cached) return cached;
        try {
            const collectionName = this._getCollectionName(organizacionCamelCase);
            const docRef = doc(db, collectionName, id);
            await consumo.registrarFirestoreLectura(collectionName, id);
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                const nivel = new RiesgoNivel(id, snap.data());
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
            const colRef = collection(db, collectionName);
            const q = query(colRef, orderBy("nombre", "asc"));
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