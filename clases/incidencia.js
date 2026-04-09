// incidencia.js - CLASE COMPLETA CON PAGINACIÓN
// CON CANALIZACIONES A ÁREAS Y A SUCURSALES

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

import {
    ref,
    uploadBytes,
    uploadBytesResumable,
    getDownloadURL,
    deleteObject,
    listAll
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-storage.js";

import { db, storage } from '/config/firebase-config.js';
import consumo from '/clases/consumoFirebase.js';

class Incidencia {
    constructor(id, data) {
        this.id = id;
        this.sucursalId = data.sucursalId || '';
        this.reportadoPorId = data.reportadoPorId || '';
        this.categoriaId = data.categoriaId || '';
        this.subcategoriaId = data.subcategoriaId || '';
        this.fechaInicio = data.fechaInicio ? this._convertirFecha(data.fechaInicio) : new Date();
        this.fechaFinalizacion = data.fechaFinalizacion ? this._convertirFecha(data.fechaFinalizacion) : null;
        this.nivelRiesgo = data.nivelRiesgo || 'bajo';
        this.estado = data.estado || 'pendiente';
        this.detalles = data.detalles || '';
        this.imagenes = data.imagenes || [];
        this.pdfUrl = data.pdfUrl || '';
        this.seguimiento = {};
        if (data.seguimiento) {
            this.seguimiento = JSON.parse(JSON.stringify(data.seguimiento));
        }

        // Canalizaciones a ÁREAS (para seguimiento interno)
        this.canalizaciones = data.canalizaciones || {};
        this.canalizacionActiva = data.canalizacionActiva || null;
        this.esMultiCanalizada = data.esMultiCanalizada || false;

        // Canalizaciones a SUCURSALES (para derivar a otra sucursal)
        this.canalizacionesSucursales = data.canalizacionesSucursales || {};

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

    // ==================== MÉTODOS PARA CANALIZACIONES A ÁREAS ====================

    agregarCanalizacionInterna(areaId, areaNombre, usuarioId, usuarioNombre, motivo = '') {
        const canalizacionId = `CAN${Date.now()}_${areaId.replace(/[^a-zA-Z0-9]/g, '_')}`;
        
        this.canalizaciones[canalizacionId] = {
            areaId,
            areaNombre,
            canalizadoPor: usuarioId,
            canalizadoPorNombre: usuarioNombre,
            motivo: motivo || 'Atención requerida',
            fechaCanalizacion: new Date(),
            estado: 'pendiente',
            seguimientos: []
        };

        if (!this.canalizacionActiva) {
            this.canalizacionActiva = areaId;
        }

        this.esMultiCanalizada = Object.keys(this.canalizaciones).length > 1;
        
        return canalizacionId;
    }

    getCanalizacionesArray() {
        const canalizacionesArray = [];
        if (this.canalizaciones) {
            Object.keys(this.canalizaciones).forEach(id => {
                canalizacionesArray.push({
                    id,
                    ...this.canalizaciones[id]
                });
            });

            canalizacionesArray.sort((a, b) => {
                const fechaA = a.fechaCanalizacion ? new Date(a.fechaCanalizacion) : 0;
                const fechaB = b.fechaCanalizacion ? new Date(b.fechaCanalizacion) : 0;
                return fechaB - fechaA;
            });
        }
        return canalizacionesArray;
    }

    estaCanalizadaAArea(areaId) {
        if (!this.canalizaciones) return false;
        return Object.values(this.canalizaciones).some(c => c.areaId === areaId);
    }

    getAreasCanalizadas() {
        const areas = [];
        if (this.canalizaciones) {
            Object.values(this.canalizaciones).forEach(c => {
                areas.push({
                    areaId: c.areaId,
                    areaNombre: c.areaNombre,
                    estado: c.estado,
                    fechaCanalizacion: c.fechaCanalizacion
                });
            });
        }
        return areas;
    }

    actualizarEstadoCanalizacionArea(areaId, nuevoEstado) {
        if (!this.canalizaciones) return false;

        let actualizado = false;

        Object.keys(this.canalizaciones).forEach(id => {
            if (this.canalizaciones[id].areaId === areaId) {
                this.canalizaciones[id].estado = nuevoEstado;
                actualizado = true;
            }
        });

        return actualizado;
    }

    // ==================== MÉTODOS PARA CANALIZACIONES A SUCURSALES ====================

    agregarCanalizacionSucursalInterna(sucursalId, sucursalNombre, usuarioId, usuarioNombre, motivo = '') {
        const canalizacionId = `CANSUC${Date.now()}_${sucursalId.replace(/[^a-zA-Z0-9]/g, '_')}`;
        
        this.canalizacionesSucursales[canalizacionId] = {
            sucursalId,
            sucursalNombre,
            canalizadoPor: usuarioId,
            canalizadoPorNombre: usuarioNombre,
            motivo: motivo || 'Atención requerida en sucursal',
            fechaCanalizacion: new Date(),
            estado: 'pendiente',
            seguimientos: []
        };
        
        return canalizacionId;
    }

    getCanalizacionesSucursalesArray() {
        const canalizacionesArray = [];
        if (this.canalizacionesSucursales) {
            Object.keys(this.canalizacionesSucursales).forEach(id => {
                canalizacionesArray.push({
                    id,
                    ...this.canalizacionesSucursales[id]
                });
            });

            canalizacionesArray.sort((a, b) => {
                const fechaA = a.fechaCanalizacion ? new Date(a.fechaCanalizacion) : 0;
                const fechaB = b.fechaCanalizacion ? new Date(b.fechaCanalizacion) : 0;
                return fechaB - fechaA;
            });
        }
        return canalizacionesArray;
    }

    getTotalCanalizacionesSucursales() {
        return Object.keys(this.canalizacionesSucursales || {}).length;
    }

    estaCanalizadaASucursal(sucursalId) {
        if (!this.canalizacionesSucursales) return false;
        return Object.values(this.canalizacionesSucursales).some(c => c.sucursalId === sucursalId);
    }

    getSucursalesCanalizadas() {
        const sucursales = [];
        if (this.canalizacionesSucursales) {
            Object.values(this.canalizacionesSucursales).forEach(c => {
                sucursales.push({
                    sucursalId: c.sucursalId,
                    sucursalNombre: c.sucursalNombre,
                    estado: c.estado,
                    fechaCanalizacion: c.fechaCanalizacion
                });
            });
        }
        return sucursales;
    }

    actualizarEstadoCanalizacionSucursal(sucursalId, nuevoEstado) {
        if (!this.canalizacionesSucursales) return false;

        let actualizado = false;

        Object.keys(this.canalizacionesSucursales).forEach(id => {
            if (this.canalizacionesSucursales[id].sucursalId === sucursalId) {
                this.canalizacionesSucursales[id].estado = nuevoEstado;
                actualizado = true;
            }
        });

        return actualizado;
    }

    // ==================== MÉTODOS GENERALES ====================

    getRutaStorageBase() {
        return `incidencias_${this.organizacionCamelCase}/${this.id}`;
    }

    getRutaImagenes() {
        return `${this.getRutaStorageBase()}/imagenes`;
    }

    getRutaSeguimiento() {
        return `${this.getRutaStorageBase()}/seguimiento`;
    }

    getRutaPDF() {
        return `${this.getRutaStorageBase()}/pdf/incidencia_${this.id}.pdf`;
    }

    agregarSeguimiento(usuarioId, usuarioNombre, descripcion, evidencias = [], fecha = new Date()) {
        const seguimientoCount = Object.keys(this.seguimiento).length;
        const seguimientoId = `SEG${seguimientoCount + 1}`;

        this.seguimiento[seguimientoId] = {
            usuarioId,
            usuarioNombre,
            descripcion,
            evidencias,
            fecha: fecha
        };

        return seguimientoId;
    }

    getSeguimientosArray() {
        const seguimientosArray = [];
        if (this.seguimiento) {
            Object.keys(this.seguimiento).forEach(id => {
                seguimientosArray.push({
                    id,
                    ...this.seguimiento[id]
                });
            });
            seguimientosArray.sort((a, b) => {
                const fechaA = a.fecha ? new Date(a.fecha) : 0;
                const fechaB = b.fecha ? new Date(b.fecha) : 0;
                return fechaA - fechaB;
            });
        }
        return seguimientosArray;
    }

    getUltimoSeguimiento() {
        const seguimientos = this.getSeguimientosArray();
        return seguimientos.length > 0 ? seguimientos[seguimientos.length - 1] : null;
    }

    getPrimerSeguimiento() {
        const seguimientos = this.getSeguimientosArray();
        return seguimientos.length > 0 ? seguimientos[0] : null;
    }

    getNivelRiesgoTexto() {
        const niveles = {
            'bajo': 'Bajo',
            'medio': 'Medio',
            'alto': 'Alto',
            'critico': 'Crítico'
        };
        return niveles[this.nivelRiesgo] || 'Bajo';
    }

    getNivelRiesgoColor() {
        const colores = {
            'bajo': '#28a745',
            'medio': '#ffc107',
            'alto': '#fd7e14',
            'critico': '#dc3545'
        };
        return colores[this.nivelRiesgo] || '#28a745';
    }

    getEstadoTexto() {
        const estados = {
            'pendiente': 'Pendiente',
            'finalizada': 'Finalizada'
        };
        return estados[this.estado] || 'Pendiente';
    }

    getEstadoColor() {
        const colores = {
            'pendiente': '#ffc107',
            'finalizada': '#28a745'
        };
        return colores[this.estado] || '#ffc107';
    }

    getFechaInicioFormateada() {
        return this._formatearFecha(this.fechaInicio);
    }

    getFechaFinalizacionFormateada() {
        return this._formatearFecha(this.fechaFinalizacion) || 'No finalizada';
    }

    getFechaCreacionFormateada() {
        return this._formatearFecha(this.fechaCreacion);
    }

    toJSON() {
        return {
            id: this.id,
            sucursalId: this.sucursalId,
            reportadoPorId: this.reportadoPorId,
            categoriaId: this.categoriaId,
            subcategoriaId: this.subcategoriaId,
            fechaInicio: this.fechaInicio,
            fechaFinalizacion: this.fechaFinalizacion,
            nivelRiesgo: this.nivelRiesgo,
            estado: this.estado,
            detalles: this.detalles,
            imagenes: this.imagenes,
            pdfUrl: this.pdfUrl,
            seguimiento: this.seguimiento,
            canalizaciones: this.canalizaciones,
            canalizacionActiva: this.canalizacionActiva,
            esMultiCanalizada: this.esMultiCanalizada,
            canalizacionesSucursales: this.canalizacionesSucursales,
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
            sucursalId: this.sucursalId,
            reportadoPorId: this.reportadoPorId,
            categoriaId: this.categoriaId,
            subcategoriaId: this.subcategoriaId,
            fechaInicio: this.getFechaInicioFormateada(),
            fechaFinalizacion: this.getFechaFinalizacionFormateada(),
            nivelRiesgo: this.nivelRiesgo,
            nivelRiesgoTexto: this.getNivelRiesgoTexto(),
            nivelRiesgoColor: this.getNivelRiesgoColor(),
            estado: this.estado,
            estadoTexto: this.getEstadoTexto(),
            estadoColor: this.getEstadoColor(),
            detalles: this.detalles,
            imagenes: this.imagenes,
            pdfUrl: this.pdfUrl,
            totalSeguimientos: this.getSeguimientosArray().length,
            ultimoSeguimiento: this.getUltimoSeguimiento(),
            // Canalizaciones a Áreas
            canalizaciones: this.getCanalizacionesArray(),
            totalCanalizaciones: this.getCanalizacionesArray().length,
            areasCanalizadas: this.getAreasCanalizadas(),
            esMultiCanalizada: this.esMultiCanalizada,
            canalizacionActiva: this.canalizacionActiva,
            // Canalizaciones a Sucursales
            canalizacionesSucursales: this.getCanalizacionesSucursalesArray(),
            totalCanalizacionesSucursales: this.getTotalCanalizacionesSucursales(),
            sucursalesCanalizadas: this.getSucursalesCanalizadas(),
            // Otros
            organizacionCamelCase: this.organizacionCamelCase,
            creadoPor: this.creadoPor,
            creadoPorNombre: this.creadoPorNombre,
            fechaCreacion: this.getFechaCreacionFormateada()
        };
    }
}

class IncidenciaManager {
    constructor() {
        this.incidencias = [];
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
        return `incidencias_${organizacionCamelCase}`;
    }

    _generarIdIncidencia(organizacionCamelCase) {
        const now = new Date();
        const fecha = now.toISOString().slice(0, 10).replace(/-/g, '');
        const hora = now.toTimeString().slice(0, 8).replace(/:/g, '');
        return `INC-${fecha}-${hora}`;
    }

    _construirConstraints(filtros = {}) {
        const constraints = [];
        
        constraints.push(orderBy("fechaCreacion", "desc"));
        
        if (filtros.estado && filtros.estado !== 'todos') {
            constraints.push(where("estado", "==", filtros.estado));
        }
        
        if (filtros.sucursalId && filtros.sucursalId !== 'todos') {
            constraints.push(where("sucursalId", "==", filtros.sucursalId));
        }
        
        if (filtros.nivelRiesgo && filtros.nivelRiesgo !== 'todos') {
            constraints.push(where("nivelRiesgo", "==", filtros.nivelRiesgo));
        }
        
        if (filtros.categoriaId && filtros.categoriaId !== 'todos') {
            constraints.push(where("categoriaId", "==", filtros.categoriaId));
        }
        
        return constraints;
    }

    async contarTotalIncidencias(organizacionCamelCase, filtros = {}) {
        try {
            const collectionName = this._getCollectionName(organizacionCamelCase);
            const incidenciasCollection = collection(db, collectionName);
            
            const constraints = this._construirConstraints(filtros);
            const constraintsSinOrder = constraints.filter(c => c.type !== 'orderBy');
            
            const q = query(incidenciasCollection, ...constraintsSinOrder);
            
            await consumo.registrarFirestoreLectura(collectionName, 'conteo incidencias');
            const snapshot = await getCountFromServer(q);
            
            return snapshot.data().count;
        } catch (error) {
            console.error('Error contando incidencias:', error);
            return 0;
        }
    }

    async getIncidenciasPaginadas(organizacionCamelCase, filtros = {}, pagina = 1, itemsPorPagina = 10, cursores = null) {
        try {
            if (!organizacionCamelCase) {
                throw new Error('Organización no especificada');
            }

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const incidenciasCollection = collection(db, collectionName);
            
            let constraints = this._construirConstraints(filtros);
            
            if (pagina > 1 && cursores?.ultimoDocumento) {
                constraints.push(startAfter(cursores.ultimoDocumento));
            }
            
            constraints.push(limit(itemsPorPagina));
            
            const q = query(incidenciasCollection, ...constraints);
            
            await consumo.registrarFirestoreLectura(collectionName, `página ${pagina}`);
            const snapshot = await getDocs(q);
            
            const incidencias = [];
            let ultimoDoc = null;
            let primerDoc = null;
            
            if (!snapshot.empty) {
                ultimoDoc = snapshot.docs[snapshot.docs.length - 1];
                primerDoc = snapshot.docs[0];
                
                snapshot.forEach(doc => {
                    try {
                        const data = doc.data();
                        const incidencia = new Incidencia(doc.id, {
                            ...data,
                            id: doc.id,
                            fechaCreacion: data.fechaCreacion?.toDate?.() || data.fechaCreacion,
                            fechaInicio: data.fechaInicio?.toDate?.() || data.fechaInicio,
                            fechaActualizacion: data.fechaActualizacion?.toDate?.() || data.fechaActualizacion
                        });
                        incidencias.push(incidencia);
                    } catch (error) {
                        console.error('Error procesando incidencia:', error);
                    }
                });
            }
            
            const total = await this.contarTotalIncidencias(organizacionCamelCase, filtros);
            
            return {
                incidencias,
                total,
                paginaActual: pagina,
                totalPaginas: Math.ceil(total / itemsPorPagina),
                ultimoDocumento: ultimoDoc,
                primerDocumento: primerDoc,
                tieneMas: snapshot.docs.length === itemsPorPagina
            };
            
        } catch (error) {
            console.error('Error obteniendo incidencias paginadas:', error);
            return {
                incidencias: [],
                total: 0,
                paginaActual: pagina,
                totalPaginas: 0,
                ultimoDocumento: null,
                primerDocumento: null,
                tieneMas: false
            };
        }
    }

    async getIncidenciasPaginaEspecifica(organizacionCamelCase, filtros = {}, paginaDeseada = 1, itemsPorPagina = 10) {
        try {
            if (paginaDeseada === 1) {
                return await this.getIncidenciasPaginadas(organizacionCamelCase, filtros, 1, itemsPorPagina);
            }
            
            const collectionName = this._getCollectionName(organizacionCamelCase);
            const incidenciasCollection = collection(db, collectionName);
            
            let constraints = this._construirConstraints(filtros);
            constraints.push(limit((paginaDeseada - 1) * itemsPorPagina + itemsPorPagina));
            
            const q = query(incidenciasCollection, ...constraints);
            
            await consumo.registrarFirestoreLectura(collectionName, `página específica ${paginaDeseada}`);
            const snapshot = await getDocs(q);
            
            const startIndex = (paginaDeseada - 1) * itemsPorPagina;
            const docsPagina = snapshot.docs.slice(startIndex, startIndex + itemsPorPagina);
            
            const incidencias = [];
            docsPagina.forEach(doc => {
                try {
                    const data = doc.data();
                    const incidencia = new Incidencia(doc.id, {
                        ...data,
                        id: doc.id,
                        fechaCreacion: data.fechaCreacion?.toDate?.() || data.fechaCreacion,
                        fechaInicio: data.fechaInicio?.toDate?.() || data.fechaInicio,
                        fechaActualizacion: data.fechaActualizacion?.toDate?.() || data.fechaActualizacion
                    });
                    incidencias.push(incidencia);
                } catch (error) {
                    console.error('Error procesando incidencia:', error);
                }
            });
            
            const total = await this.contarTotalIncidencias(organizacionCamelCase, filtros);
            const ultimoDoc = docsPagina.length > 0 ? docsPagina[docsPagina.length - 1] : null;
            
            return {
                incidencias,
                total,
                paginaActual: paginaDeseada,
                totalPaginas: Math.ceil(total / itemsPorPagina),
                ultimoDocumento: ultimoDoc,
                primerDocumento: docsPagina.length > 0 ? docsPagina[0] : null,
                tieneMas: docsPagina.length === itemsPorPagina
            };
            
        } catch (error) {
            console.error('Error obteniendo página específica:', error);
            return {
                incidencias: [],
                total: 0,
                paginaActual: paginaDeseada,
                totalPaginas: 0,
                ultimoDocumento: null,
                primerDocumento: null,
                tieneMas: false
            };
        }
    }

    async subirArchivo(file, rutaCompleta, onProgress = null) {
        try {
            const storageRef = ref(storage, rutaCompleta);

            if (onProgress) {
                return new Promise((resolve, reject) => {
                    const uploadTask = uploadBytesResumable(storageRef, file);

                    uploadTask.on('state_changed',
                        (snapshot) => {
                            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                            onProgress(progress);
                        },
                        (error) => {
                            console.error('Error en subida:', error);
                            reject(error);
                        },
                        async () => {
                            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                            await consumo.registrarStorageSubida(rutaCompleta, file.name);
                            resolve({
                                url: downloadURL,
                                path: rutaCompleta,
                                nombre: file.name,
                                tipo: file.type,
                                tamaño: file.size
                            });
                        }
                    );
                });
            } else {
                const snapshot = await uploadBytes(storageRef, file);
                const downloadURL = await getDownloadURL(snapshot.ref);
                await consumo.registrarStorageSubida(rutaCompleta, file.name);
                return {
                    url: downloadURL,
                    path: rutaCompleta,
                    nombre: file.name,
                    tipo: file.type,
                    tamaño: file.size
                };
            }
        } catch (error) {
            console.error('Error subiendo archivo:', error);
            throw error;
        }
    }

    async eliminarArchivo(urlODirectorio) {
        try {
            const storageRef = ref(storage, urlODirectorio);
            await deleteObject(storageRef);
            await consumo.registrarStorageEliminacion(urlODirectorio);
            return true;
        } catch (error) {
            console.error('Error eliminando archivo:', error);
            throw error;
        }
    }

    async eliminarCarpetaStorage(rutaCarpeta) {
        try {
            const folderRef = ref(storage, rutaCarpeta);
            const result = await listAll(folderRef);

            const deletePromises = [];
            result.items.forEach(itemRef => {
                deletePromises.push(deleteObject(itemRef));
            });

            result.prefixes.forEach(folderRef => {
                deletePromises.push(this.eliminarCarpetaStorage(folderRef.fullPath));
            });

            await Promise.all(deletePromises);
            await consumo.registrarStorageEliminacion(rutaCarpeta);
            return true;
        } catch (error) {
            console.error('Error eliminando carpeta:', error);
            if (error.code === 'storage/object-not-found') {
                return true;
            }
            throw error;
        }
    }

    async crearIncidencia(data, usuarioActual, archivos = [], imagenesConDatos = []) {
        try {
            if (!usuarioActual || !usuarioActual.organizacionCamelCase) {
                throw new Error('Usuario no tiene organización asignada');
            }

            const organizacion = usuarioActual.organizacionCamelCase;
            const collectionName = this._getCollectionName(organizacion);
            const incidenciasCollection = collection(db, collectionName);

            const incidenciaId = this._generarIdIncidencia(organizacion);
            const incidenciaRef = doc(incidenciasCollection, incidenciaId);

            let imagenesUrls = [];
            if (archivos.length > 0) {
                for (let i = 0; i < archivos.length; i++) {
                    const file = archivos[i];
                    const comentario = imagenesConDatos[i]?.comentario || '';

                    const timestamp = Date.now();
                    const nombreArchivo = `${timestamp}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
                    const rutaStorage = `incidencias_${organizacion}/${incidenciaId}/imagenes/${nombreArchivo}`;

                    const resultado = await this.subirArchivo(file, rutaStorage);

                    imagenesUrls.push({
                        url: resultado.url,
                        comentario: comentario
                    });
                }
            }

            const fechaInicio = data.fechaInicio || new Date();

            // Canalizaciones a Áreas
            let canalizaciones = {};
            let canalizacionActiva = null;
            let esMultiCanalizada = false;

            if (data.canalizaciones && Array.isArray(data.canalizaciones) && data.canalizaciones.length > 0) {
                data.canalizaciones.forEach((canal, index) => {
                    if (canal.areaId && canal.areaNombre) {
                        const canalId = `CAN${Date.now()}_${index}_${canal.areaId.replace(/[^a-zA-Z0-9]/g, '_')}`;

                        canalizaciones[canalId] = {
                            areaId: canal.areaId,
                            areaNombre: canal.areaNombre,
                            canalizadoPor: usuarioActual.id,
                            canalizadoPorNombre: usuarioActual.nombreCompleto || '',
                            motivo: canal.motivo || 'Atención requerida',
                            fechaCanalizacion: new Date(),
                            estado: 'pendiente',
                            seguimientos: []
                        };

                        if (index === 0) {
                            canalizacionActiva = canal.areaId;
                        }
                    }
                });

                esMultiCanalizada = Object.keys(canalizaciones).length > 1;
            }

            // Canalizaciones a Sucursales
            let canalizacionesSucursales = {};
            if (data.canalizacionesSucursales && Array.isArray(data.canalizacionesSucursales) && data.canalizacionesSucursales.length > 0) {
                data.canalizacionesSucursales.forEach((canal, index) => {
                    if (canal.sucursalId && canal.sucursalNombre) {
                        const canalId = `CANSUC${Date.now()}_${index}_${canal.sucursalId.replace(/[^a-zA-Z0-9]/g, '_')}`;

                        canalizacionesSucursales[canalId] = {
                            sucursalId: canal.sucursalId,
                            sucursalNombre: canal.sucursalNombre,
                            canalizadoPor: usuarioActual.id,
                            canalizadoPorNombre: usuarioActual.nombreCompleto || '',
                            motivo: canal.motivo || 'Atención requerida en sucursal',
                            fechaCanalizacion: new Date(),
                            estado: 'pendiente',
                            seguimientos: []
                        };
                    }
                });
            }

            const incidenciaData = {
                sucursalId: data.sucursalId,
                reportadoPorId: data.reportadoPorId || usuarioActual.id,
                categoriaId: data.categoriaId,
                subcategoriaId: data.subcategoriaId || '',
                fechaInicio: fechaInicio,
                fechaFinalizacion: null,
                nivelRiesgo: data.nivelRiesgo,
                estado: 'pendiente',
                detalles: data.detalles?.trim() || '',
                imagenes: imagenesUrls,
                pdfUrl: '',
                seguimiento: {},
                canalizaciones: canalizaciones,
                canalizacionActiva: canalizacionActiva,
                esMultiCanalizada: esMultiCanalizada,
                canalizacionesSucursales: canalizacionesSucursales,
                organizacionCamelCase: organizacion,
                creadoPor: usuarioActual.id,
                creadoPorNombre: usuarioActual.nombreCompleto || '',
                actualizadoPor: usuarioActual.id,
                actualizadoPorNombre: usuarioActual.nombreCompleto || '',
                fechaCreacion: serverTimestamp(),
                fechaActualizacion: serverTimestamp()
            };

            await consumo.registrarFirestoreEscritura(collectionName, incidenciaId);
            await setDoc(incidenciaRef, incidenciaData);

            const nuevaIncidencia = new Incidencia(incidenciaId, {
                ...incidenciaData,
                fechaCreacion: new Date(),
                fechaActualizacion: new Date()
            });

            this.incidencias.unshift(nuevaIncidencia);

            const historial = await this._getHistorialManager();
            if (historial) {
                const totalCanalizaciones = Object.keys(canalizaciones).length;
                const totalCanalizacionesSucursales = Object.keys(canalizacionesSucursales).length;
                const descripcionCanalizacion = totalCanalizaciones > 0 ? ` - Canalizada a ${totalCanalizaciones} área(s)` : '';
                const descripcionCanalizacionSucursal = totalCanalizacionesSucursales > 0 ? ` - Derivada a ${totalCanalizacionesSucursales} sucursal(es)` : '';

                await historial.registrarActividad({
                    usuario: usuarioActual,
                    tipo: 'crear',
                    modulo: 'incidencias',
                    descripcion: `Creó incidencia ${incidenciaId}${descripcionCanalizacion}${descripcionCanalizacionSucursal} - ${data.detalles?.substring(0, 50)}...`,
                    detalles: {
                        incidenciaId,
                        sucursalId: data.sucursalId,
                        categoriaId: data.categoriaId,
                        nivelRiesgo: data.nivelRiesgo,
                        totalImagenes: imagenesUrls.length,
                        totalCanalizaciones: totalCanalizaciones,
                        totalCanalizacionesSucursales: totalCanalizacionesSucursales
                    }
                });
            }

            return nuevaIncidencia;

        } catch (error) {
            console.error('Error creando incidencia:', error);
            throw error;
        }
    }

    async getIncidenciaById(incidenciaId, organizacionCamelCase) {
        if (!organizacionCamelCase) return null;

        const incidenciaInMemory = this.incidencias.find(inc => inc.id === incidenciaId);
        if (incidenciaInMemory) return incidenciaInMemory;

        try {
            const collectionName = this._getCollectionName(organizacionCamelCase);
            const incidenciaRef = doc(db, collectionName, incidenciaId);
            
            await consumo.registrarFirestoreLectura(collectionName, incidenciaId);
            const incidenciaSnap = await getDoc(incidenciaRef);

            if (incidenciaSnap.exists()) {
                const data = incidenciaSnap.data();
                const incidencia = new Incidencia(incidenciaId, { ...data, id: incidenciaId });
                this.incidencias.push(incidencia);
                return incidencia;
            }
            return null;

        } catch (error) {
            console.error('Error obteniendo incidencia:', error);
            return null;
        }
    }

    async getIncidenciasByOrganizacion(organizacionCamelCase, filtros = {}, usuarioActual = null) {
        try {
            if (!organizacionCamelCase) return [];

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const incidenciasCollection = collection(db, collectionName);

            let constraints = [orderBy("fechaCreacion", "desc")];

            if (filtros.estado) {
                constraints.push(where("estado", "==", filtros.estado));
            }
            if (filtros.sucursalId) {
                constraints.push(where("sucursalId", "==", filtros.sucursalId));
            }
            if (filtros.nivelRiesgo) {
                constraints.push(where("nivelRiesgo", "==", filtros.nivelRiesgo));
            }
            if (filtros.categoriaId) {
                constraints.push(where("categoriaId", "==", filtros.categoriaId));
            }

            const incidenciasQuery = query(incidenciasCollection, ...constraints);
            
            await consumo.registrarFirestoreLectura(collectionName, 'lista incidencias');
            const snapshot = await getDocs(incidenciasQuery);

            const incidencias = [];
            snapshot.forEach(doc => {
                try {
                    const incidencia = new Incidencia(doc.id, doc.data());
                    incidencias.push(incidencia);
                } catch (error) {
                    console.error('Error procesando incidencia:', error);
                }
            });

            this.incidencias = incidencias;

            if (usuarioActual) {
                const historial = await this._getHistorialManager();
                if (historial) {
                    await historial.registrarActividad({
                        usuario: usuarioActual,
                        tipo: 'leer',
                        modulo: 'incidencias',
                        descripcion: `Consultó lista de incidencias (${incidencias.length} incidencias)`,
                        detalles: { total: incidencias.length, filtros }
                    });
                }
            }

            return incidencias;

        } catch (error) {
            console.error('Error listando incidencias:', error);
            return [];
        }
    }

    async getIncidenciasPorAreaCanalizada(organizacionCamelCase, areaId, filtros = {}) {
        try {
            const todasIncidencias = await this.getIncidenciasByOrganizacion(organizacionCamelCase, filtros);

            return todasIncidencias.filter(inc => {
                if (!inc.canalizaciones) return false;
                return Object.values(inc.canalizaciones).some(c => c.areaId === areaId);
            });

        } catch (error) {
            console.error('Error filtrando incidencias por área:', error);
            return [];
        }
    }

    async getIncidenciasPorSucursalCanalizada(organizacionCamelCase, sucursalId, filtros = {}) {
        try {
            const todasIncidencias = await this.getIncidenciasByOrganizacion(organizacionCamelCase, filtros);

            return todasIncidencias.filter(inc => {
                if (!inc.canalizacionesSucursales) return false;
                return Object.values(inc.canalizacionesSucursales).some(c => c.sucursalId === sucursalId);
            });

        } catch (error) {
            console.error('Error filtrando incidencias por sucursal canalizada:', error);
            return [];
        }
    }

    // ==================== AGREGAR CANALIZACIÓN A ÁREA ====================
    async agregarCanalizacion(incidenciaId, areaId, areaNombre, usuarioId, usuarioNombre, motivo = '', organizacionCamelCase) {
        try {
            if (!incidenciaId || !areaId || !organizacionCamelCase) {
                throw new Error('Faltan datos para agregar canalización a área');
            }

            const collectionName = this._getCollectionName(organizacionCamelCase);
            
            const canalizacionId = `CAN${Date.now()}_${areaId.replace(/[^a-zA-Z0-9]/g, '_')}`;

            const incidenciaRef = doc(db, collectionName, incidenciaId);
            await consumo.registrarFirestoreLectura(collectionName, incidenciaId);
            const incidenciaSnap = await getDoc(incidenciaRef);

            if (!incidenciaSnap.exists()) {
                throw new Error('Incidencia no encontrada');
            }

            const incidenciaData = incidenciaSnap.data();
            const canalizacionesActuales = incidenciaData.canalizaciones || {};

            const yaExiste = Object.values(canalizacionesActuales).some(c => c.areaId === areaId);
            if (yaExiste) {
                return { success: false, message: 'Ya está canalizada a esta área' };
            }

            const nuevaCanalizacion = {
                areaId,
                areaNombre,
                canalizadoPor: usuarioId,
                canalizadoPorNombre: usuarioNombre,
                motivo: motivo || 'Atención requerida',
                fechaCanalizacion: new Date(),
                estado: 'pendiente',
                seguimientos: []
            };

            const nuevasCanalizaciones = {
                ...canalizacionesActuales,
                [canalizacionId]: nuevaCanalizacion
            };

            const esMultiCanalizada = Object.keys(nuevasCanalizaciones).length > 1;
            
            let canalizacionActiva = incidenciaData.canalizacionActiva;
            if (!canalizacionActiva && Object.keys(nuevasCanalizaciones).length > 0) {
                canalizacionActiva = areaId;
            }

            await consumo.registrarFirestoreActualizacion(collectionName, incidenciaId);
            await updateDoc(incidenciaRef, {
                canalizaciones: nuevasCanalizaciones,
                canalizacionActiva: canalizacionActiva,
                esMultiCanalizada: esMultiCanalizada,
                fechaActualizacion: serverTimestamp(),
                actualizadoPor: usuarioId,
                actualizadoPorNombre: usuarioNombre
            });

            const incidenciaIndex = this.incidencias.findIndex(i => i.id === incidenciaId);
            if (incidenciaIndex !== -1) {
                this.incidencias[incidenciaIndex].canalizaciones = nuevasCanalizaciones;
                this.incidencias[incidenciaIndex].canalizacionActiva = canalizacionActiva;
                this.incidencias[incidenciaIndex].esMultiCanalizada = esMultiCanalizada;
                this.incidencias[incidenciaIndex].fechaActualizacion = new Date();
            }

            return {
                success: true,
                canalizacionId,
                areaId,
                areaNombre
            };

        } catch (error) {
            console.error('Error agregando canalización a área:', error);
            throw error;
        }
    }

    // ==================== AGREGAR CANALIZACIÓN A SUCURSAL ====================
    async agregarCanalizacionSucursal(incidenciaId, sucursalId, sucursalNombre, usuarioId, usuarioNombre, motivo = '', organizacionCamelCase) {
        try {
            if (!incidenciaId || !sucursalId || !organizacionCamelCase) {
                throw new Error('Faltan datos para agregar canalización a sucursal');
            }

            const collectionName = this._getCollectionName(organizacionCamelCase);

            const canalizacionId = `CANSUC${Date.now()}_${sucursalId.replace(/[^a-zA-Z0-9]/g, '_')}`;

            const incidenciaRef = doc(db, collectionName, incidenciaId);
            await consumo.registrarFirestoreLectura(collectionName, incidenciaId);
            const incidenciaSnap = await getDoc(incidenciaRef);

            if (!incidenciaSnap.exists()) {
                throw new Error('Incidencia no encontrada');
            }

            const incidenciaData = incidenciaSnap.data();
            const canalizacionesActuales = incidenciaData.canalizacionesSucursales || {};

            const yaExiste = Object.values(canalizacionesActuales).some(c => c.sucursalId === sucursalId);
            if (yaExiste) {
                return { success: false, message: 'Ya está canalizada a esta sucursal' };
            }

            const nuevaCanalizacion = {
                sucursalId,
                sucursalNombre,
                canalizadoPor: usuarioId,
                canalizadoPorNombre: usuarioNombre,
                motivo: motivo || 'Atención requerida en sucursal',
                fechaCanalizacion: new Date(),
                estado: 'pendiente',
                seguimientos: []
            };

            const nuevasCanalizaciones = {
                ...canalizacionesActuales,
                [canalizacionId]: nuevaCanalizacion
            };

            await consumo.registrarFirestoreActualizacion(collectionName, incidenciaId);
            await updateDoc(incidenciaRef, {
                canalizacionesSucursales: nuevasCanalizaciones,
                fechaActualizacion: serverTimestamp(),
                actualizadoPor: usuarioId,
                actualizadoPorNombre: usuarioNombre
            });

            const incidenciaIndex = this.incidencias.findIndex(i => i.id === incidenciaId);
            if (incidenciaIndex !== -1) {
                this.incidencias[incidenciaIndex].canalizacionesSucursales = nuevasCanalizaciones;
                this.incidencias[incidenciaIndex].fechaActualizacion = new Date();
            }

            return {
                success: true,
                canalizacionId,
                sucursalId,
                sucursalNombre
            };

        } catch (error) {
            console.error('Error agregando canalización a sucursal:', error);
            throw error;
        }
    }

    async actualizarIncidencia(incidenciaId, nuevosDatos, usuarioId, organizacionCamelCase, usuarioActual = null) {
        try {
            if (!organizacionCamelCase) {
                throw new Error('Se requiere organización para actualizar incidencia');
            }

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const incidenciaRef = doc(db, collectionName, incidenciaId);
            
            await consumo.registrarFirestoreLectura(collectionName, incidenciaId);
            const incidenciaSnap = await getDoc(incidenciaRef);

            if (!incidenciaSnap.exists()) {
                throw new Error(`Incidencia con ID ${incidenciaId} no encontrada`);
            }

            const datosActuales = incidenciaSnap.data();

            const datosActualizados = {
                ...nuevosDatos,
                fechaActualizacion: serverTimestamp(),
                actualizadoPor: usuarioId
            };

            delete datosActualizados.id;
            delete datosActualizados.organizacionCamelCase;
            delete datosActualizados.fechaCreacion;

            await consumo.registrarFirestoreActualizacion(collectionName, incidenciaId);
            await updateDoc(incidenciaRef, datosActualizados);

            const incidenciaIndex = this.incidencias.findIndex(i => i.id === incidenciaId);
            if (incidenciaIndex !== -1) {
                const incidenciaActual = this.incidencias[incidenciaIndex];
                Object.keys(datosActualizados).forEach(key => {
                    if (key !== 'id') {
                        incidenciaActual[key] = datosActualizados[key];
                    }
                });
                incidenciaActual.fechaActualizacion = new Date();
                incidenciaActual.actualizadoPor = usuarioId;
            }

            if (usuarioActual) {
                const historial = await this._getHistorialManager();
                if (historial) {
                    const cambios = [];
                    if (datosActuales.estado !== nuevosDatos.estado) {
                        cambios.push(`estado: ${datosActuales.estado} → ${nuevosDatos.estado}`);
                    }
                    if (datosActuales.nivelRiesgo !== nuevosDatos.nivelRiesgo) {
                        cambios.push(`riesgo: ${datosActuales.nivelRiesgo} → ${nuevosDatos.nivelRiesgo}`);
                    }

                    await historial.registrarActividad({
                        usuario: usuarioActual,
                        tipo: 'editar',
                        modulo: 'incidencias',
                        descripcion: `Actualizó incidencia ${incidenciaId} (${cambios.join(', ') || 'sin cambios'})`,
                        detalles: {
                            incidenciaId,
                            cambios,
                            datosActualizados: nuevosDatos
                        }
                    });
                }
            }

            return await this.getIncidenciaById(incidenciaId, organizacionCamelCase);

        } catch (error) {
            console.error('Error actualizando incidencia:', error);
            throw error;
        }
    }

    async agregarSeguimiento(incidenciaId, usuarioId, usuarioNombre, descripcion, archivos = [], organizacionCamelCase, evidenciasConComentarios = [], fechaSeleccionada, usuarioActual = null) {
        try {
            const incidencia = await this.getIncidenciaById(incidenciaId, organizacionCamelCase);
            if (!incidencia) {
                throw new Error('Incidencia no encontrada');
            }

            const seguimientoCount = Object.keys(incidencia.seguimiento || {}).length;
            const seguimientoId = `SEG${seguimientoCount + 1}`;

            const evidenciasUrls = [];
            if (archivos.length > 0) {
                for (let i = 0; i < archivos.length; i++) {
                    const file = archivos[i];
                    const comentario = evidenciasConComentarios[i]?.comentario || '';

                    const timestamp = Date.now();
                    const nombreArchivo = `${timestamp}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
                    const rutaStorage = `incidencias_${organizacionCamelCase}/${incidenciaId}/seguimiento/${seguimientoId}/${nombreArchivo}`;

                    const resultado = await this.subirArchivo(file, rutaStorage);

                    evidenciasUrls.push({
                        url: resultado.url,
                        comentario: comentario
                    });
                }
            }

            const fechaSeguimiento = fechaSeleccionada || new Date();

            const nuevoSeguimiento = {
                usuarioId,
                usuarioNombre,
                descripcion,
                evidencias: evidenciasUrls,
                fecha: fechaSeguimiento
            };

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const incidenciaRef = doc(db, collectionName, incidenciaId);

            const seguimientoActualizado = {
                ...incidencia.seguimiento,
                [seguimientoId]: nuevoSeguimiento
            };

            await consumo.registrarFirestoreActualizacion(collectionName, incidenciaId);
            await updateDoc(incidenciaRef, {
                seguimiento: seguimientoActualizado,
                fechaActualizacion: serverTimestamp(),
                actualizadoPor: usuarioId,
                actualizadoPorNombre: usuarioNombre
            });

            const incidenciaIndex = this.incidencias.findIndex(i => i.id === incidenciaId);
            if (incidenciaIndex !== -1) {
                this.incidencias[incidenciaIndex].seguimiento = seguimientoActualizado;
                this.incidencias[incidenciaIndex].fechaActualizacion = new Date();
                this.incidencias[incidenciaIndex].actualizadoPor = usuarioId;
                this.incidencias[incidenciaIndex].actualizadoPorNombre = usuarioNombre;
            }

            if (usuarioActual) {
                const historial = await this._getHistorialManager();
                if (historial) {
                    await historial.registrarActividad({
                        usuario: usuarioActual,
                        tipo: 'crear',
                        modulo: 'incidencias',
                        descripcion: `Agregó seguimiento a incidencia ${incidenciaId}`,
                        detalles: {
                            incidenciaId,
                            seguimientoId,
                            totalEvidencias: evidenciasUrls.length
                        }
                    });
                }
            }

            return seguimientoId;

        } catch (error) {
            console.error('Error agregando seguimiento:', error);
            throw error;
        }
    }

    async finalizarIncidencia(incidenciaId, usuarioId, usuarioNombre, organizacionCamelCase, usuarioActual = null) {
        try {
            const incidencia = await this.getIncidenciaById(incidenciaId, organizacionCamelCase);
            if (!incidencia) {
                throw new Error('Incidencia no encontrada');
            }

            if (incidencia.estado === 'finalizada') {
                throw new Error('La incidencia ya está finalizada');
            }

            const fechaFinalizacion = new Date();

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const incidenciaRef = doc(db, collectionName, incidenciaId);

            await consumo.registrarFirestoreActualizacion(collectionName, incidenciaId);
            await updateDoc(incidenciaRef, {
                estado: 'finalizada',
                fechaFinalizacion: serverTimestamp(),
                fechaActualizacion: serverTimestamp(),
                actualizadoPor: usuarioId,
                actualizadoPorNombre: usuarioNombre
            });

            const incidenciaIndex = this.incidencias.findIndex(i => i.id === incidenciaId);
            if (incidenciaIndex !== -1) {
                this.incidencias[incidenciaIndex].estado = 'finalizada';
                this.incidencias[incidenciaIndex].fechaFinalizacion = fechaFinalizacion;
                this.incidencias[incidenciaIndex].fechaActualizacion = fechaFinalizacion;
                this.incidencias[incidenciaIndex].actualizadoPor = usuarioId;
                this.incidencias[incidenciaIndex].actualizadoPorNombre = usuarioNombre;
            }

            if (usuarioActual) {
                const historial = await this._getHistorialManager();
                if (historial) {
                    await historial.registrarActividad({
                        usuario: usuarioActual,
                        tipo: 'editar',
                        modulo: 'incidencias',
                        descripcion: `Finalizó incidencia ${incidenciaId}`,
                        detalles: {
                            incidenciaId,
                            estadoAnterior: 'pendiente',
                            estadoNuevo: 'finalizada'
                        }
                    });
                }
            }

            return true;

        } catch (error) {
            console.error('Error finalizando incidencia:', error);
            throw error;
        }
    }

    async eliminarIncidencia(incidenciaId, usuarioId, organizacionCamelCase, eliminarArchivos = true, usuarioActual = null) {
        try {
            if (!organizacionCamelCase) {
                throw new Error('Se requiere organización para eliminar incidencia');
            }

            const incidencia = await this.getIncidenciaById(incidenciaId, organizacionCamelCase);
            const detallesIncidencia = incidencia ? incidencia.detalles : '';

            if (eliminarArchivos && incidencia) {
                const rutaStorage = `incidencias_${organizacionCamelCase}/${incidenciaId}`;
                await this.eliminarCarpetaStorage(rutaStorage);
            }

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const incidenciaRef = doc(db, collectionName, incidenciaId);
            
            await consumo.registrarFirestoreEliminacion(collectionName, incidenciaId);
            await deleteDoc(incidenciaRef);

            const incidenciaIndex = this.incidencias.findIndex(i => i.id === incidenciaId);
            if (incidenciaIndex !== -1) {
                this.incidencias.splice(incidenciaIndex, 1);
            }

            if (usuarioActual) {
                const historial = await this._getHistorialManager();
                if (historial) {
                    await historial.registrarActividad({
                        usuario: usuarioActual,
                        tipo: 'eliminar',
                        modulo: 'incidencias',
                        descripcion: `Eliminó incidencia ${incidenciaId}`,
                        detalles: {
                            incidenciaId,
                            detalles: detallesIncidencia?.substring(0, 100)
                        }
                    });
                }
            }

            return true;

        } catch (error) {
            console.error('Error eliminando incidencia:', error);
            throw error;
        }
    }

    async getIncidenciasPorSucursal(sucursalId, organizacionCamelCase) {
        return await this.getIncidenciasByOrganizacion(organizacionCamelCase, { sucursalId });
    }

    async getIncidenciasPorEstado(estado, organizacionCamelCase) {
        return await this.getIncidenciasByOrganizacion(organizacionCamelCase, { estado });
    }

    async getIncidenciasPorRiesgo(nivelRiesgo, organizacionCamelCase) {
        return await this.getIncidenciasByOrganizacion(organizacionCamelCase, { nivelRiesgo });
    }

    async getEstadisticas(organizacionCamelCase) {
        try {
            const collectionName = this._getCollectionName(organizacionCamelCase);
            await consumo.registrarFirestoreLectura(collectionName, 'estadísticas');
            
            const incidencias = await this.getIncidenciasByOrganizacion(organizacionCamelCase);

            const incidenciasCanalizadas = incidencias.filter(i => i.canalizaciones && Object.keys(i.canalizaciones).length > 0);
            const incidenciasMultiCanalizadas = incidencias.filter(i => i.esMultiCanalizada);
            const incidenciasConCanalizacionSucursal = incidencias.filter(i => i.canalizacionesSucursales && Object.keys(i.canalizacionesSucursales).length > 0);

            return {
                total: incidencias.length,
                pendientes: incidencias.filter(i => i.estado === 'pendiente').length,
                finalizadas: incidencias.filter(i => i.estado === 'finalizada').length,
                porRiesgo: {
                    bajo: incidencias.filter(i => i.nivelRiesgo === 'bajo').length,
                    medio: incidencias.filter(i => i.nivelRiesgo === 'medio').length,
                    alto: incidencias.filter(i => i.nivelRiesgo === 'alto').length,
                    critico: incidencias.filter(i => i.nivelRiesgo === 'critico').length
                },
                conImagenes: incidencias.filter(i => (i.imagenes || []).length > 0).length,
                totalSeguimientos: incidencias.reduce((acc, i) => acc + i.getSeguimientosArray().length, 0),
                conPDF: incidencias.filter(i => i.pdfUrl).length,
                canalizadas: incidenciasCanalizadas.length,
                multiCanalizadas: incidenciasMultiCanalizadas.length,
                totalCanalizaciones: incidencias.reduce((acc, i) => acc + (i.canalizaciones ? Object.keys(i.canalizaciones).length : 0), 0),
                canalizadasSucursales: incidenciasConCanalizacionSucursal.length,
                totalCanalizacionesSucursales: incidencias.reduce((acc, i) => acc + (i.canalizacionesSucursales ? Object.keys(i.canalizacionesSucursales).length : 0), 0)
            };
        } catch (error) {
            console.error('Error obteniendo estadísticas:', error);
            return null;
        }
    }

    async verificarIncidenciaExistente(incidenciaId, organizacionCamelCase) {
        try {
            const collectionName = this._getCollectionName(organizacionCamelCase);
            const incidenciaRef = doc(db, collectionName, incidenciaId);
            
            await consumo.registrarFirestoreLectura(collectionName, incidenciaId);
            const incidenciaSnap = await getDoc(incidenciaRef);
            return incidenciaSnap.exists();
        } catch (error) {
            console.error('Error verificando incidencia:', error);
            return false;
        }
    }

    limpiarCache() {
        this.incidencias = [];
    }
    // Agrega estos métodos a la clase IncidenciaManager (en incidencia.js)

// ==================== MÉTODOS ADICIONALES PARA EL CONTROLLER ====================

/**
 * Actualiza SOLO las imágenes de una incidencia (sin recargar toda la incidencia)
 */
async actualizarImagenes(incidenciaId, imagenesUrls, organizacionCamelCase, usuarioId, usuarioNombre) {
    try {
        if (!organizacionCamelCase) {
            throw new Error('Se requiere organización');
        }

        const collectionName = this._getCollectionName(organizacionCamelCase);
        const incidenciaRef = doc(db, collectionName, incidenciaId);
        
        await consumo.registrarFirestoreActualizacion(collectionName, incidenciaId);
        await updateDoc(incidenciaRef, {
            imagenes: imagenesUrls,
            fechaActualizacion: serverTimestamp(),
            actualizadoPor: usuarioId,
            actualizadoPorNombre: usuarioNombre
        });

        // Actualizar caché
        const incidenciaIndex = this.incidencias.findIndex(i => i.id === incidenciaId);
        if (incidenciaIndex !== -1) {
            this.incidencias[incidenciaIndex].imagenes = imagenesUrls;
            this.incidencias[incidenciaIndex].fechaActualizacion = new Date();
        }

        return true;
    } catch (error) {
        console.error('Error actualizando imágenes:', error);
        throw error;
    }
}

/**
 * Actualiza SOLO el PDF de una incidencia
 */
async actualizarPDF(incidenciaId, pdfUrl, organizacionCamelCase, usuarioId, usuarioNombre) {
    try {
        if (!organizacionCamelCase) {
            throw new Error('Se requiere organización');
        }

        const collectionName = this._getCollectionName(organizacionCamelCase);
        const incidenciaRef = doc(db, collectionName, incidenciaId);
        
        await consumo.registrarFirestoreActualizacion(collectionName, incidenciaId);
        await updateDoc(incidenciaRef, {
            pdfUrl: pdfUrl,
            fechaActualizacion: serverTimestamp(),
            actualizadoPor: usuarioId,
            actualizadoPorNombre: usuarioNombre
        });

        // Actualizar caché
        const incidenciaIndex = this.incidencias.findIndex(i => i.id === incidenciaId);
        if (incidenciaIndex !== -1) {
            this.incidencias[incidenciaIndex].pdfUrl = pdfUrl;
            this.incidencias[incidenciaIndex].fechaActualizacion = new Date();
        }

        return true;
    } catch (error) {
        console.error('Error actualizando PDF:', error);
        throw error;
    }
}

/**
 * Actualiza múltiples campos de una incidencia (genérico)
 */
async actualizarCamposIncidencia(incidenciaId, campos, organizacionCamelCase, usuarioId, usuarioNombre) {
    try {
        if (!organizacionCamelCase) {
            throw new Error('Se requiere organización');
        }

        const collectionName = this._getCollectionName(organizacionCamelCase);
        const incidenciaRef = doc(db, collectionName, incidenciaId);
        
        const datosActualizar = {
            ...campos,
            fechaActualizacion: serverTimestamp(),
            actualizadoPor: usuarioId,
            actualizadoPorNombre: usuarioNombre
        };
        
        delete datosActualizar.id;
        delete datosActualizar.organizacionCamelCase;
        delete datosActualizar.fechaCreacion;
        
        await consumo.registrarFirestoreActualizacion(collectionName, incidenciaId);
        await updateDoc(incidenciaRef, datosActualizar);

        // Actualizar caché
        const incidenciaIndex = this.incidencias.findIndex(i => i.id === incidenciaId);
        if (incidenciaIndex !== -1) {
            Object.keys(campos).forEach(key => {
                if (key !== 'id') {
                    this.incidencias[incidenciaIndex][key] = campos[key];
                }
            });
            this.incidencias[incidenciaIndex].fechaActualizacion = new Date();
            this.incidencias[incidenciaIndex].actualizadoPor = usuarioId;
            this.incidencias[incidenciaIndex].actualizadoPorNombre = usuarioNombre;
        }

        return true;
    } catch (error) {
        console.error('Error actualizando campos:', error);
        throw error;
    }
}
}

export { Incidencia, IncidenciaManager };