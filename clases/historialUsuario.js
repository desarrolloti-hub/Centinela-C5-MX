// historialUsuario.js - CON REGISTRO DE CONSUMO FIREBASE

import {
    collection,
    doc,
    getDocs,
    getDoc,
    setDoc,
    updateDoc,
    query,
    where,
    orderBy,
    limit,
    serverTimestamp,
    Timestamp
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

import { db } from '/config/firebase-config.js';

// [MODIFICACIÓN 1]: Importar la instancia de consumo
import consumo from '/clases/consumoFirebase.js';

class Actividad {
    constructor(id, data) {
        this.id = id;
        this.usuarioId = data.usuarioId || '';
        this.usuarioNombre = data.usuarioNombre || '';
        this.usuarioCorreo = data.usuarioCorreo || '';
        this.tipo = data.tipo || '';
        this.modulo = data.modulo || '';
        this.descripcion = data.descripcion || '';
        this.detalles = data.detalles || {};
        this.fecha = data.fecha ? this._convertirFecha(data.fecha) : new Date();
        this.organizacionCamelCase = data.organizacionCamelCase || '';
    }

    _convertirFecha(fecha) {
        if (!fecha) return new Date();
        if (fecha && typeof fecha.toDate === 'function') return fecha.toDate();
        if (fecha instanceof Date) return fecha;
        if (typeof fecha === 'string') return new Date(fecha);
        return new Date();
    }

    getHoraFormateada() {
        if (!this.fecha) return '--:--';
        try {
            return this.fecha.toLocaleTimeString('es-MX', {
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return '--:--';
        }
    }

    getIcono() {
        const iconos = {
            login: 'fa-sign-in-alt',
            logout: 'fa-sign-out-alt',
            crear: 'fa-plus-circle',
            editar: 'fa-edit',
            eliminar: 'fa-trash-alt',
            leer: 'fa-eye',
            tema: 'fa-paint-roller'
        };
        return iconos[this.tipo] || 'fa-history';
    }

    getColor() {
        const colores = {
            login: '#28a745',
            logout: '#dc3545',
            crear: '#28a745',
            editar: '#ffc107',
            eliminar: '#dc3545',
            leer: '#17a2b8',
            tema: '#6f42c1'
        };
        return colores[this.tipo] || '#6c757d';
    }

    toUI() {
        return {
            id: this.id,
            usuario: {
                id: this.usuarioId,
                nombre: this.usuarioNombre,
                correo: this.usuarioCorreo
            },
            tipo: this.tipo,
            modulo: this.modulo,
            descripcion: this.descripcion,
            detalles: this.detalles,
            hora: this.getHoraFormateada(),
            fechaObj: this.fecha,
            icono: this.getIcono(),
            color: this.getColor()
        };
    }
}

class HistorialUsuarioManager {
    constructor() {
    }

    _getCollectionName(organizacionCamelCase) {
        return `historial_${organizacionCamelCase}`;
    }

    _generarDocumentId(usuarioId, fecha) {
        const year = fecha.getFullYear();
        const month = String(fecha.getMonth() + 1).padStart(2, '0');
        const day = String(fecha.getDate()).padStart(2, '0');
        return `${usuarioId}_${year}-${month}-${day}`;
    }

    _generarActividadId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        return `${timestamp}_${random}`;
    }

    _getInicioDia(fecha = new Date()) {
        const inicio = new Date(fecha);
        inicio.setHours(0, 0, 0, 0);
        return inicio;
    }

    async _getOrCreateDocumento(usuario, fecha, organizacionCamelCase) {
        const docId = this._generarDocumentId(usuario.id, fecha);
        const inicioDia = this._getInicioDia(fecha);
        
        const collectionName = this._getCollectionName(organizacionCamelCase);
        const docRef = doc(db, collectionName, docId);
        
        try {
            // [MODIFICACIÓN 2]: Registrar LECTURA antes de getDoc
            await consumo.registrarFirestoreLectura(collectionName, docId);
            
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                return docRef;
            } else {
                const nuevoDoc = {
                    usuarioId: usuario.id,
                    usuarioNombre: usuario.nombreCompleto || 'Usuario',
                    usuarioCorreo: usuario.correo || usuario.email || '',
                    fecha: Timestamp.fromDate(inicioDia),
                    actividades: {},
                    totalActividades: 0,
                    organizacionCamelCase,
                    fechaCreacion: serverTimestamp(),
                    fechaActualizacion: serverTimestamp()
                };
                
                // [MODIFICACIÓN 3]: Registrar ESCRITURA antes de setDoc
                await consumo.registrarFirestoreEscritura(collectionName, docId);
                
                await setDoc(docRef, nuevoDoc);
                return docRef;
            }
        } catch (error) {
            console.error('Error en _getOrCreateDocumento:', error);
            throw error;
        }
    }

    async registrarActividad({ usuario, tipo, modulo, descripcion, detalles = {} }) {
        try {
            // Validaciones básicas
            if (!usuario) {
                console.error('❌ Error: usuario es null');
                return null;
            }

            if (!usuario.organizacionCamelCase) {
                console.error('❌ Error: usuario sin organizacionCamelCase');
                return null;
            }

            const usuarioId = usuario.id || usuario.uid;
            if (!usuarioId) {
                console.error('❌ Error: usuario sin ID');
                return null;
            }

            const organizacion = usuario.organizacionCamelCase;
            const ahora = new Date();

            // Normalizar usuario
            const usuarioNormalizado = {
                id: usuarioId,
                nombreCompleto: usuario.nombreCompleto || 'Usuario',
                correo: usuario.correo || usuario.email || ''
            };

            // Obtener referencia al documento del día
            const docRef = await this._getOrCreateDocumento(usuarioNormalizado, ahora, organizacion);

            // Generar ID único para la actividad
            const actividadId = this._generarActividadId();

            // Crear objeto de actividad
            const actividad = {
                usuarioId: usuarioId,
                usuarioNombre: usuario.nombreCompleto || 'Usuario',
                usuarioCorreo: usuario.correo || usuario.email || '',
                tipo,
                modulo,
                descripcion,
                detalles,
                fecha: ahora.toISOString()
            };

            // [MODIFICACIÓN 4]: Registrar LECTURA para obtener total actual
            const collectionName = this._getCollectionName(organizacion);
            await consumo.registrarFirestoreLectura(collectionName, docRef.id);
            
            const docSnap = await getDoc(docRef);
            const totalActual = docSnap.data()?.totalActividades || 0;

            // [MODIFICACIÓN 5]: Registrar ACTUALIZACIÓN antes de updateDoc
            await consumo.registrarFirestoreActualizacion(collectionName, docRef.id);

            // Actualizar Firestore - agregar al MAP y aumentar contador
            const updateData = {
                [`actividades.${actividadId}`]: actividad,
                totalActividades: totalActual + 1,
                fechaActualizacion: serverTimestamp()
            };

            await updateDoc(docRef, updateData);
            return new Actividad(actividadId, {
                ...actividad,
                organizacionCamelCase: organizacion
            });

        } catch (error) {
            console.error('❌ Error en registrarActividad:', error);
            return null;
        }
    }

    /**
     * Obtiene actividades de TODOS los usuarios para una fecha específica
     * @param {Date} fecha - Fecha a consultar
     * @param {string} organizacionCamelCase - Organización
     * @returns {Promise<Array<Actividad>>} - Actividades de todos los usuarios
     */
    async obtenerActividadesPorFecha(fecha, organizacionCamelCase) {
        try {
            if (!organizacionCamelCase) return [];

            const inicioDia = this._getInicioDia(fecha);
            const finDia = new Date(fecha);
            finDia.setHours(23, 59, 59, 999);

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const historialCollection = collection(db, collectionName);
            
            // Query para obtener documentos de la fecha específica
            const q = query(
                historialCollection,
                where("fecha", ">=", Timestamp.fromDate(inicioDia)),
                where("fecha", "<=", Timestamp.fromDate(finDia))
            );

            // [MODIFICACIÓN 6]: Registrar LECTURA antes de getDocs
            await consumo.registrarFirestoreLectura(collectionName, 'actividades por fecha');

            const snapshot = await getDocs(q);
            const actividades = [];

            for (const doc of snapshot.docs) {
                const data = doc.data();
                const actividadesMap = data.actividades || {};
                
                Object.entries(actividadesMap).forEach(([actId, actData]) => {
                    try {
                        actividades.push(new Actividad(actId, {
                            ...actData,
                            organizacionCamelCase
                        }));
                    } catch (error) {
                        console.error('Error procesando actividad:', error);
                    }
                });
            }

            // Ordenar por fecha (más reciente primero)
            actividades.sort((a, b) => b.fecha - a.fecha);

            return actividades;

        } catch (error) {
            console.error('Error en obtenerActividadesPorFecha:', error);
            return [];
        }
    }

    /**
     * ✅ NUEVO: Obtiene actividades SOLO de un usuario específico para una fecha
     * @param {string} usuarioId - ID del usuario
     * @param {Date} fecha - Fecha a consultar
     * @param {string} organizacionCamelCase - Organización
     * @returns {Promise<Array<Actividad>>} - Actividades del usuario
     */
    async obtenerActividadesPorUsuarioYFecha(usuarioId, fecha, organizacionCamelCase) {
        try {
            if (!organizacionCamelCase || !usuarioId) return [];

            const docId = this._generarDocumentId(usuarioId, fecha);
            const collectionName = this._getCollectionName(organizacionCamelCase);
            const docRef = doc(db, collectionName, docId);

            // [MODIFICACIÓN 7]: Registrar LECTURA antes de getDoc
            await consumo.registrarFirestoreLectura(collectionName, docId);

            const docSnap = await getDoc(docRef);
            
            if (!docSnap.exists()) {
                return [];
            }

            const data = docSnap.data();
            const actividadesMap = data.actividades || {};
            const actividades = [];

            Object.entries(actividadesMap).forEach(([actId, actData]) => {
                try {
                    actividades.push(new Actividad(actId, {
                        ...actData,
                        organizacionCamelCase
                    }));
                } catch (error) {
                    console.error('Error procesando actividad:', error);
                }
            });

            // Ordenar por fecha (más reciente primero)
            actividades.sort((a, b) => b.fecha - a.fecha);

            return actividades;

        } catch (error) {
            console.error('Error en obtenerActividadesPorUsuarioYFecha:', error);
            return [];
        }
    }

    generarDescripcion(tipo, modulo, detalles = {}) {
        const acciones = {
            login: 'Inició sesión en el sistema',
            logout: 'Cerró sesión',
            crear: `Creó ${modulo}`,
            editar: `Editó ${modulo}`,
            eliminar: `Eliminó ${modulo}`,
            leer: `Consultó ${modulo}`,
            tema: `Cambió el tema`
        };

        let descripcionBase = acciones[tipo] || `${tipo} en ${modulo}`;

        if (detalles.nombre) {
            descripcionBase += ` "${detalles.nombre}"`;
        }
        if (detalles.nombreOriginal && detalles.nombreOriginal !== detalles.nombre) {
            descripcionBase += ` (anterior: "${detalles.nombreOriginal}")`;
        }

        return descripcionBase;
    }
}

export { Actividad, HistorialUsuarioManager };