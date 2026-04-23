// mercanciaPerdida.js - CLASE COMPLETA PARA REGISTRO DE MERCANCÍA PERDIDA/ROBADA
// VERSIÓN OPTIMIZADA CON GENERACIÓN EN SEGUNDO PLANO

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

class MercanciaPerdida {
    constructor(id, data) {
        this.id = id;
        this.nombreEmpresaCC = data.nombreEmpresaCC || '';
        this.narracionEventos = data.narracionEventos || '';
        this.montoPerdido = data.montoPerdido || 0;
        this.montoRecuperado = data.montoRecuperado || 0;
        this.evidencias = data.evidencias || [];
        this.detallesPerdida = data.detallesPerdida || '';
        this.fecha = data.fecha ? this._convertirFecha(data.fecha) : new Date();
        this.hora = data.hora || '';
        this.reportadoPorId = data.reportadoPorId || '';
        this.reportadoPorNombre = data.reportadoPorNombre || '';
        this.estado = data.estado || 'activo'; // activo, recuperado, cerrado
        this.tipoEvento = data.tipoEvento || 'robo'; // robo, extravio, incidencia, otro
        this.ubicacion = data.ubicacion || '';
        this.responsableAsignado = data.responsableAsignado || '';
        this.responsableAsignadoNombre = data.responsableAsignadoNombre || '';

        // ========== NUEVOS CAMPOS PARA PDF OPTIMIZADO ==========
        this.pdfUrl = data.pdfUrl || null;
        this.pdfGenerado = data.pdfGenerado || false;
        this.pdfGeneradoEn = data.pdfGeneradoEn ? this._convertirFecha(data.pdfGeneradoEn) : null;
        this.estadoGeneracion = data.estadoGeneracion || 'pendiente'; // pendiente, generando, completado, error
        this.intentosGeneracion = data.intentosGeneracion || 0;
        // =======================================================

        // Campos de auditoría
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
                year: 'numeric', month: 'long', day: 'numeric'
            });
        } catch {
            return 'Fecha inválida';
        }
    }

    _formatearHora(hora) {
        if (!hora) return 'No disponible';
        return hora;
    }

    getMontoTotal() {
        return this.montoPerdido;
    }

    getMontoNeto() {
        return this.montoPerdido - (this.montoRecuperado || 0);
    }

    getEstadoTexto() {
        const estados = {
            'activo': 'Activo',
            'recuperado': 'Recuperado',
            'cerrado': 'Cerrado'
        };
        return estados[this.estado] || 'Activo';
    }

    getEstadoColor() {
        const colores = {
            'activo': '#ffc107',
            'recuperado': '#28a745',
            'cerrado': '#6c757d'
        };
        return colores[this.estado] || '#ffc107';
    }

    getTipoEventoTexto() {
        const tipos = {
            'robo': 'Robo',
            'extravio': 'Extravío',
            'incidencia': 'Incidencia',
            'otro': 'Otro'
        };
        return tipos[this.tipoEvento] || 'Robo';
    }

    getFechaFormateada() {
        return this._formatearFecha(this.fecha);
    }

    getHoraFormateada() {
        return this._formatearHora(this.hora);
    }

    getFechaCreacionFormateada() {
        return this._formatearFecha(this.fechaCreacion);
    }

    getPorcentajeRecuperado() {
        if (this.montoPerdido === 0) return 0;
        return (this.montoRecuperado / this.montoPerdido) * 100;
    }

    getRutaStorageBase() {
        return `mercancia_perdida_${this.organizacionCamelCase}/${this.id}`;
    }

    getRutaEvidencias() {
        return `${this.getRutaStorageBase()}/evidencias`;
    }

    // ========== NUEVOS MÉTODOS PARA PDF ==========
    tienePDF() {
        return this.pdfGenerado === true && this.pdfUrl !== null;
    }

    getEstadoGeneracionTexto() {
        const estados = {
            'pendiente': 'Pendiente',
            'generando': 'Generando PDF...',
            'completado': 'PDF Listo',
            'error': 'Error al generar'
        };
        return estados[this.estadoGeneracion] || 'Pendiente';
    }

    getEstadoGeneracionColor() {
        const colores = {
            'pendiente': '#ffc107',
            'generando': '#17a2b8',
            'completado': '#28a745',
            'error': '#dc3545'
        };
        return colores[this.estadoGeneracion] || '#6c757d';
    }
    // ============================================

    agregarEvidencia(url, comentario = '') {
        const evidenciaId = `EVD${Date.now()}`;

        if (!this.evidencias) {
            this.evidencias = [];
        }

        this.evidencias.push({
            id: evidenciaId,
            url: url,
            comentario: comentario,
            fechaAgregada: new Date()
        });

        return evidenciaId;
    }

    eliminarEvidencia(evidenciaId) {
        if (!this.evidencias) return false;
        const index = this.evidencias.findIndex(e => e.id === evidenciaId);
        if (index !== -1) {
            this.evidencias.splice(index, 1);
            return true;
        }
        return false;
    }

    getEvidenciasArray() {
        if (!this.evidencias) return [];
        return [...this.evidencias].sort((a, b) => {
            const fechaA = a.fechaAgregada ? new Date(a.fechaAgregada) : 0;
            const fechaB = b.fechaAgregada ? new Date(b.fechaAgregada) : 0;
            return fechaB - fechaA;
        });
    }

    registrarRecuperacion(montoRecuperadoAdicional, comentario = '', usuarioId = '', usuarioNombre = '') {
        const nuevoTotalRecuperado = (this.montoRecuperado || 0) + montoRecuperadoAdicional;
        this.montoRecuperado = nuevoTotalRecuperado;

        if (nuevoTotalRecuperado >= this.montoPerdido && this.estado === 'activo') {
            this.estado = 'recuperado';
        }

        if (!this.historialRecuperaciones) {
            this.historialRecuperaciones = [];
        }

        this.historialRecuperaciones.push({
            monto: montoRecuperadoAdicional,
            comentario: comentario,
            fecha: new Date(),
            usuarioId: usuarioId,
            usuarioNombre: usuarioNombre
        });

        return true;
    }

    toJSON() {
        return {
            id: this.id,
            nombreEmpresaCC: this.nombreEmpresaCC,
            narracionEventos: this.narracionEventos,
            montoPerdido: this.montoPerdido,
            montoRecuperado: this.montoRecuperado,
            evidencias: this.evidencias,
            detallesPerdida: this.detallesPerdida,
            fecha: this.fecha,
            hora: this.hora,
            reportadoPorId: this.reportadoPorId,
            reportadoPorNombre: this.reportadoPorNombre,
            estado: this.estado,
            tipoEvento: this.tipoEvento,
            ubicacion: this.ubicacion,
            responsableAsignado: this.responsableAsignado,
            responsableAsignadoNombre: this.responsableAsignadoNombre,
            historialRecuperaciones: this.historialRecuperaciones,
            pdfUrl: this.pdfUrl,
            pdfGenerado: this.pdfGenerado,
            pdfGeneradoEn: this.pdfGeneradoEn,
            estadoGeneracion: this.estadoGeneracion,
            intentosGeneracion: this.intentosGeneracion,
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
            nombreEmpresaCC: this.nombreEmpresaCC,
            narracionEventos: this.narracionEventos,
            montoPerdido: this.montoPerdido,
            montoRecuperado: this.montoRecuperado,
            montoNeto: this.getMontoNeto(),
            porcentajeRecuperado: this.getPorcentajeRecuperado(),
            evidencias: this.getEvidenciasArray(),
            totalEvidencias: this.getEvidenciasArray().length,
            detallesPerdida: this.detallesPerdida,
            fecha: this.getFechaFormateada(),
            fechaOriginal: this.fecha,
            hora: this.getHoraFormateada(),
            reportadoPorId: this.reportadoPorId,
            reportadoPorNombre: this.reportadoPorNombre,
            estado: this.estado,
            estadoTexto: this.getEstadoTexto(),
            estadoColor: this.getEstadoColor(),
            tipoEvento: this.tipoEvento,
            tipoEventoTexto: this.getTipoEventoTexto(),
            ubicacion: this.ubicacion,
            responsableAsignado: this.responsableAsignado,
            responsableAsignadoNombre: this.responsableAsignadoNombre,
            pdfUrl: this.pdfUrl,
            pdfGenerado: this.pdfGenerado,
            estadoGeneracion: this.estadoGeneracion,
            estadoGeneracionTexto: this.getEstadoGeneracionTexto(),
            estadoGeneracionColor: this.getEstadoGeneracionColor(),
            tienePDF: this.tienePDF(),
            organizacionCamelCase: this.organizacionCamelCase,
            creadoPor: this.creadoPor,
            creadoPorNombre: this.creadoPorNombre,
            fechaCreacion: this.getFechaCreacionFormateada()
        };
    }
}

class MercanciaPerdidaManager {
    constructor() {
        this.registros = [];
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
        return `mercancia_perdida_${organizacionCamelCase}`;
    }

    _generarIdRegistro(organizacionCamelCase) {
        const now = new Date();
        const fecha = now.toISOString().slice(0, 10).replace(/-/g, '');
        const hora = now.toTimeString().slice(0, 8).replace(/:/g, '');
        return `MP-${fecha}-${hora}`;
    }

    _construirConstraints(filtros = {}) {
        const constraints = [];

        constraints.push(orderBy("fecha", "desc"));

        if (filtros.estado && filtros.estado !== 'todos') {
            constraints.push(where("estado", "==", filtros.estado));
        }

        if (filtros.tipoEvento && filtros.tipoEvento !== 'todos') {
            constraints.push(where("tipoEvento", "==", filtros.tipoEvento));
        }

        if (filtros.nombreEmpresaCC && filtros.nombreEmpresaCC !== 'todos') {
            constraints.push(where("nombreEmpresaCC", "==", filtros.nombreEmpresaCC));
        }

        if (filtros.reportadoPorId && filtros.reportadoPorId !== 'todos') {
            constraints.push(where("reportadoPorId", "==", filtros.reportadoPorId));
        }

        return constraints;
    }

    async contarTotalRegistros(organizacionCamelCase, filtros = {}) {
        try {
            const collectionName = this._getCollectionName(organizacionCamelCase);
            const collectionRef = collection(db, collectionName);

            const constraints = this._construirConstraints(filtros);
            const constraintsSinOrder = constraints.filter(c => c.type !== 'orderBy');

            const q = query(collectionRef, ...constraintsSinOrder);

            await consumo.registrarFirestoreLectura(collectionName, 'conteo mercancia perdida');
            const snapshot = await getCountFromServer(q);

            return snapshot.data().count;
        } catch (error) {
            console.error('Error contando registros:', error);
            return 0;
        }
    }

    async getRegistrosPaginados(organizacionCamelCase, filtros = {}, pagina = 1, itemsPorPagina = 10, cursores = null) {
        try {
            if (!organizacionCamelCase) {
                throw new Error('Organización no especificada');
            }

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const collectionRef = collection(db, collectionName);

            let constraints = this._construirConstraints(filtros);

            if (pagina > 1 && cursores?.ultimoDocumento) {
                constraints.push(startAfter(cursores.ultimoDocumento));
            }

            constraints.push(limit(itemsPorPagina));

            const q = query(collectionRef, ...constraints);

            await consumo.registrarFirestoreLectura(collectionName, `página ${pagina}`);
            const snapshot = await getDocs(q);

            const registros = [];
            let ultimoDoc = null;
            let primerDoc = null;

            if (!snapshot.empty) {
                ultimoDoc = snapshot.docs[snapshot.docs.length - 1];
                primerDoc = snapshot.docs[0];

                snapshot.forEach(doc => {
                    try {
                        const data = doc.data();
                        const registro = new MercanciaPerdida(doc.id, {
                            ...data,
                            id: doc.id,
                            fecha: data.fecha?.toDate?.() || data.fecha,
                            fechaCreacion: data.fechaCreacion?.toDate?.() || data.fechaCreacion,
                            fechaActualizacion: data.fechaActualizacion?.toDate?.() || data.fechaActualizacion,
                            pdfGeneradoEn: data.pdfGeneradoEn?.toDate?.() || data.pdfGeneradoEn
                        });
                        registros.push(registro);
                    } catch (error) {
                        console.error('Error procesando registro:', error);
                    }
                });
            }

            const total = await this.contarTotalRegistros(organizacionCamelCase, filtros);

            return {
                registros,
                total,
                paginaActual: pagina,
                totalPaginas: Math.ceil(total / itemsPorPagina),
                ultimoDocumento: ultimoDoc,
                primerDocumento: primerDoc,
                tieneMas: snapshot.docs.length === itemsPorPagina
            };

        } catch (error) {
            console.error('Error obteniendo registros paginados:', error);
            return {
                registros: [],
                total: 0,
                paginaActual: pagina,
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

    async crearRegistro(data, usuarioActual, archivos = [], evidenciasConComentarios = []) {
        try {
            if (!usuarioActual || !usuarioActual.organizacionCamelCase) {
                throw new Error('Usuario no tiene organización asignada');
            }

            const organizacion = usuarioActual.organizacionCamelCase;
            const collectionName = this._getCollectionName(organizacion);
            const collectionRef = collection(db, collectionName);

            const registroId = this._generarIdRegistro(organizacion);
            const registroDocRef = doc(collectionRef, registroId);

            let evidenciasUrls = [];
            if (archivos.length > 0) {
                for (let i = 0; i < archivos.length; i++) {
                    const file = archivos[i];
                    const comentario = evidenciasConComentarios[i]?.comentario || '';

                    const timestamp = Date.now();
                    const nombreArchivo = `${timestamp}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
                    const rutaStorage = `mercancia_perdida_${organizacion}/${registroId}/evidencias/${nombreArchivo}`;

                    const resultado = await this.subirArchivo(file, rutaStorage);

                    evidenciasUrls.push({
                        id: `EVD${Date.now()}_${i}`,
                        url: resultado.url,
                        comentario: comentario,
                        fechaAgregada: new Date()
                    });
                }
            }

            const registroData = {
                nombreEmpresaCC: data.nombreEmpresaCC,
                narracionEventos: data.narracionEventos?.trim() || '',
                montoPerdido: parseFloat(data.montoPerdido) || 0,
                montoRecuperado: parseFloat(data.montoRecuperado) || 0,
                evidencias: evidenciasUrls,
                detallesPerdida: data.detallesPerdida?.trim() || '',
                fecha: data.fecha || new Date(),
                hora: data.hora || '',
                reportadoPorId: data.reportadoPorId || usuarioActual.id,
                reportadoPorNombre: data.reportadoPorNombre || usuarioActual.nombreCompleto || '',
                estado: 'activo',
                tipoEvento: data.tipoEvento || 'robo',
                ubicacion: data.ubicacion || '',
                responsableAsignado: data.responsableAsignado || '',
                responsableAsignadoNombre: data.responsableAsignadoNombre || '',
                historialRecuperaciones: [],
                // ========== NUEVOS CAMPOS ==========
                pdfUrl: null,
                pdfGenerado: false,
                pdfGeneradoEn: null,
                estadoGeneracion: 'pendiente',
                intentosGeneracion: 0,
                // ==================================
                organizacionCamelCase: organizacion,
                creadoPor: usuarioActual.id,
                creadoPorNombre: usuarioActual.nombreCompleto || '',
                actualizadoPor: usuarioActual.id,
                actualizadoPorNombre: usuarioActual.nombreCompleto || '',
                fechaCreacion: serverTimestamp(),
                fechaActualizacion: serverTimestamp()
            };

            await consumo.registrarFirestoreEscritura(collectionName, registroId);
            await setDoc(registroDocRef, registroData);

            const nuevoRegistro = new MercanciaPerdida(registroId, {
                ...registroData,
                fechaCreacion: new Date(),
                fechaActualizacion: new Date()
            });

            this.registros.unshift(nuevoRegistro);

            const historial = await this._getHistorialManager();
            if (historial) {
                await historial.registrarActividad({
                    usuario: usuarioActual,
                    tipo: 'crear',
                    modulo: 'mercancia_perdida',
                    descripcion: `Creó registro de mercancía ${registroId} - ${data.nombreEmpresaCC} - $${data.montoPerdido}`,
                    detalles: {
                        registroId,
                        nombreEmpresaCC: data.nombreEmpresaCC,
                        montoPerdido: data.montoPerdido,
                        tipoEvento: data.tipoEvento,
                        totalEvidencias: evidenciasUrls.length
                    }
                });
            }

            return nuevoRegistro;

        } catch (error) {
            console.error('Error creando registro de mercancía perdida:', error);
            throw error;
        }
    }

    async getRegistroById(registroId, organizacionCamelCase) {
        if (!organizacionCamelCase) return null;

        const registroInMemory = this.registros.find(reg => reg.id === registroId);
        if (registroInMemory) return registroInMemory;

        try {
            const collectionName = this._getCollectionName(organizacionCamelCase);
            const registroRef = doc(db, collectionName, registroId);

            await consumo.registrarFirestoreLectura(collectionName, registroId);
            const registroSnap = await getDoc(registroRef);

            if (registroSnap.exists()) {
                const data = registroSnap.data();
                const registro = new MercanciaPerdida(registroId, {
                    ...data,
                    id: registroId,
                    pdfGeneradoEn: data.pdfGeneradoEn?.toDate?.() || data.pdfGeneradoEn
                });
                this.registros.push(registro);
                return registro;
            }
            return null;

        } catch (error) {
            console.error('Error obteniendo registro:', error);
            return null;
        }
    }
    // Agregar este método después de getRegistroById

    async actualizarEstadoPDF(registroId, estado, pdfUrl = null, organizacionCamelCase, usuarioActual = null) {
        try {
            const collectionName = this._getCollectionName(organizacionCamelCase);
            const registroRef = doc(db, collectionName, registroId);

            const updateData = {
                estadoGeneracion: estado,
                fechaActualizacion: serverTimestamp(),
                actualizadoPor: usuarioActual?.id || 'sistema',
                actualizadoPorNombre: usuarioActual?.nombreCompleto || 'Sistema'
            };

            if (estado === 'completado' && pdfUrl) {
                updateData.pdfUrl = pdfUrl;
                updateData.pdfGenerado = true;
                updateData.pdfGeneradoEn = serverTimestamp();
            }

            if (estado === 'error') {
                updateData.intentosGeneracion = (await this.getRegistroById(registroId, organizacionCamelCase))?.intentosGeneracion + 1 || 1;
            }

            await consumo.registrarFirestoreActualizacion(collectionName, registroId);
            await updateDoc(registroRef, updateData);

            // Actualizar caché
            const registroIndex = this.registros.findIndex(r => r.id === registroId);
            if (registroIndex !== -1) {
                if (estado === 'completado' && pdfUrl) {
                    this.registros[registroIndex].pdfUrl = pdfUrl;
                    this.registros[registroIndex].pdfGenerado = true;
                    this.registros[registroIndex].pdfGeneradoEn = new Date();
                }
                this.registros[registroIndex].estadoGeneracion = estado;
            }

            return true;
        } catch (error) {
            console.error('Error actualizando estado PDF:', error);
            return false;
        }
    }

    async getRegistrosByOrganizacion(organizacionCamelCase, filtros = {}, usuarioActual = null) {
        try {
            if (!organizacionCamelCase) return [];

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const collectionRef = collection(db, collectionName);

            let constraints = [orderBy("fecha", "desc")];

            if (filtros.estado) {
                constraints.push(where("estado", "==", filtros.estado));
            }
            if (filtros.tipoEvento) {
                constraints.push(where("tipoEvento", "==", filtros.tipoEvento));
            }
            if (filtros.nombreEmpresaCC) {
                constraints.push(where("nombreEmpresaCC", "==", filtros.nombreEmpresaCC));
            }

            const registrosQuery = query(collectionRef, ...constraints);

            await consumo.registrarFirestoreLectura(collectionName, 'lista mercancia perdida');
            const snapshot = await getDocs(registrosQuery);

            const registros = [];
            snapshot.forEach(doc => {
                try {
                    const data = doc.data();
                    const registro = new MercanciaPerdida(doc.id, {
                        ...data,
                        pdfGeneradoEn: data.pdfGeneradoEn?.toDate?.() || data.pdfGeneradoEn
                    });
                    registros.push(registro);
                } catch (error) {
                    console.error('Error procesando registro:', error);
                }
            });

            this.registros = registros;

            if (usuarioActual) {
                const historial = await this._getHistorialManager();
                if (historial) {
                    await historial.registrarActividad({
                        usuario: usuarioActual,
                        tipo: 'leer',
                        modulo: 'mercancia_perdida',
                        descripcion: `Consultó lista de mercancía perdida (${registros.length} registros)`,
                        detalles: { total: registros.length, filtros }
                    });
                }
            }

            return registros;

        } catch (error) {
            console.error('Error listando registros:', error);
            return [];
        }
    }

    async actualizarEstadoPDF(registroId, estado, pdfUrl = null, organizacionCamelCase, usuarioActual = null) {
        try {
            const collectionName = this._getCollectionName(organizacionCamelCase);
            const registroRef = doc(db, collectionName, registroId);

            const updateData = {
                estadoGeneracion: estado,
                fechaActualizacion: serverTimestamp(),
                actualizadoPor: usuarioActual?.id || 'sistema',
                actualizadoPorNombre: usuarioActual?.nombreCompleto || 'Sistema'
            };

            if (estado === 'completado' && pdfUrl) {
                updateData.pdfUrl = pdfUrl;
                updateData.pdfGenerado = true;
                updateData.pdfGeneradoEn = serverTimestamp();
            }

            if (estado === 'error') {
                updateData.intentosGeneracion = (await this.getRegistroById(registroId, organizacionCamelCase))?.intentosGeneracion + 1 || 1;
            }

            await consumo.registrarFirestoreActualizacion(collectionName, registroId);
            await updateDoc(registroRef, updateData);

            // Actualizar caché
            const registroIndex = this.registros.findIndex(r => r.id === registroId);
            if (registroIndex !== -1) {
                if (estado === 'completado' && pdfUrl) {
                    this.registros[registroIndex].pdfUrl = pdfUrl;
                    this.registros[registroIndex].pdfGenerado = true;
                    this.registros[registroIndex].pdfGeneradoEn = new Date();
                }
                this.registros[registroIndex].estadoGeneracion = estado;
            }

            return true;
        } catch (error) {
            console.error('Error actualizando estado PDF:', error);
            return false;
        }
    }

    async actualizarRegistro(registroId, nuevosDatos, usuarioId, organizacionCamelCase, usuarioActual = null) {
        try {
            if (!organizacionCamelCase) {
                throw new Error('Se requiere organización para actualizar registro');
            }

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const registroRef = doc(db, collectionName, registroId);

            await consumo.registrarFirestoreLectura(collectionName, registroId);
            const registroSnap = await getDoc(registroRef);

            if (!registroSnap.exists()) {
                throw new Error(`Registro con ID ${registroId} no encontrado`);
            }

            const datosActuales = registroSnap.data();

            const datosActualizados = {
                ...nuevosDatos,
                fechaActualizacion: serverTimestamp(),
                actualizadoPor: usuarioId
            };

            delete datosActualizados.id;
            delete datosActualizados.organizacionCamelCase;
            delete datosActualizados.fechaCreacion;

            await consumo.registrarFirestoreActualizacion(collectionName, registroId);
            await updateDoc(registroRef, datosActualizados);

            const registroIndex = this.registros.findIndex(r => r.id === registroId);
            if (registroIndex !== -1) {
                const registroActual = this.registros[registroIndex];
                Object.keys(datosActualizados).forEach(key => {
                    if (key !== 'id') {
                        registroActual[key] = datosActualizados[key];
                    }
                });
                registroActual.fechaActualizacion = new Date();
                registroActual.actualizadoPor = usuarioId;
            }

            if (usuarioActual) {
                const historial = await this._getHistorialManager();
                if (historial) {
                    const cambios = [];
                    if (datosActuales.estado !== nuevosDatos.estado) {
                        cambios.push(`estado: ${datosActuales.estado} → ${nuevosDatos.estado}`);
                    }
                    if (datosActuales.montoRecuperado !== nuevosDatos.montoRecuperado) {
                        cambios.push(`recuperado: $${datosActuales.montoRecuperado} → $${nuevosDatos.montoRecuperado}`);
                    }

                    await historial.registrarActividad({
                        usuario: usuarioActual,
                        tipo: 'editar',
                        modulo: 'mercancia_perdida',
                        descripcion: `Actualizó registro ${registroId} (${cambios.join(', ') || 'sin cambios'})`,
                        detalles: {
                            registroId,
                            cambios,
                            datosActualizados: nuevosDatos
                        }
                    });
                }
            }

            return await this.getRegistroById(registroId, organizacionCamelCase);

        } catch (error) {
            console.error('Error actualizando registro:', error);
            throw error;
        }
    }

    async agregarEvidencia(registroId, archivo, comentario, organizacionCamelCase, usuarioActual = null) {
        try {
            const registro = await this.getRegistroById(registroId, organizacionCamelCase);
            if (!registro) {
                throw new Error('Registro no encontrado');
            }

            const timestamp = Date.now();
            const nombreArchivo = `${timestamp}_${archivo.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
            const rutaStorage = `mercancia_perdida_${organizacionCamelCase}/${registroId}/evidencias/${nombreArchivo}`;

            const resultado = await this.subirArchivo(archivo, rutaStorage);

            const evidenciaId = `EVD${Date.now()}`;
            const nuevaEvidencia = {
                id: evidenciaId,
                url: resultado.url,
                comentario: comentario || '',
                fechaAgregada: new Date()
            };

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const registroRef = doc(db, collectionName, registroId);

            const evidenciasActualizadas = [...(registro.evidencias || []), nuevaEvidencia];

            await consumo.registrarFirestoreActualizacion(collectionName, registroId);
            await updateDoc(registroRef, {
                evidencias: evidenciasActualizadas,
                fechaActualizacion: serverTimestamp()
            });

            const registroIndex = this.registros.findIndex(r => r.id === registroId);
            if (registroIndex !== -1) {
                this.registros[registroIndex].evidencias = evidenciasActualizadas;
                this.registros[registroIndex].fechaActualizacion = new Date();
            }

            if (usuarioActual) {
                const historial = await this._getHistorialManager();
                if (historial) {
                    await historial.registrarActividad({
                        usuario: usuarioActual,
                        tipo: 'crear',
                        modulo: 'mercancia_perdida',
                        descripcion: `Agregó evidencia a registro ${registroId}`,
                        detalles: { registroId, evidenciaId }
                    });
                }
            }

            return nuevaEvidencia;

        } catch (error) {
            console.error('Error agregando evidencia:', error);
            throw error;
        }
    }

    async registrarRecuperacion(registroId, montoRecuperado, comentario, usuarioId, usuarioNombre, organizacionCamelCase, usuarioActual = null) {
        try {
            const registro = await this.getRegistroById(registroId, organizacionCamelCase);
            if (!registro) {
                throw new Error('Registro no encontrado');
            }

            const nuevoTotalRecuperado = (registro.montoRecuperado || 0) + montoRecuperado;
            const nuevoEstado = nuevoTotalRecuperado >= registro.montoPerdido ? 'recuperado' : registro.estado;

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const registroRef = doc(db, collectionName, registroId);

            const historialRecuperaciones = [...(registro.historialRecuperaciones || []), {
                monto: montoRecuperado,
                comentario: comentario || '',
                fecha: new Date(),
                usuarioId: usuarioId,
                usuarioNombre: usuarioNombre
            }];

            await consumo.registrarFirestoreActualizacion(collectionName, registroId);
            await updateDoc(registroRef, {
                montoRecuperado: nuevoTotalRecuperado,
                estado: nuevoEstado,
                historialRecuperaciones: historialRecuperaciones,
                fechaActualizacion: serverTimestamp(),
                actualizadoPor: usuarioId,
                actualizadoPorNombre: usuarioNombre
            });

            const registroIndex = this.registros.findIndex(r => r.id === registroId);
            if (registroIndex !== -1) {
                this.registros[registroIndex].montoRecuperado = nuevoTotalRecuperado;
                this.registros[registroIndex].estado = nuevoEstado;
                this.registros[registroIndex].historialRecuperaciones = historialRecuperaciones;
                this.registros[registroIndex].fechaActualizacion = new Date();
            }

            if (usuarioActual) {
                const historial = await this._getHistorialManager();
                if (historial) {
                    await historial.registrarActividad({
                        usuario: usuarioActual,
                        tipo: 'editar',
                        modulo: 'mercancia_perdida',
                        descripcion: `Registró recuperación de $${montoRecuperado} para ${registroId}`,
                        detalles: {
                            registroId,
                            montoRecuperado,
                            totalRecuperado: nuevoTotalRecuperado,
                            porcentaje: registro.getPorcentajeRecuperado()
                        }
                    });
                }
            }

            return {
                success: true,
                nuevoTotalRecuperado,
                nuevoEstado
            };

        } catch (error) {
            console.error('Error registrando recuperación:', error);
            throw error;
        }
    }

    async eliminarRegistro(registroId, organizacionCamelCase, eliminarArchivos = true, usuarioActual = null) {
        try {
            if (!organizacionCamelCase) {
                throw new Error('Se requiere organización para eliminar registro');
            }

            const registro = await this.getRegistroById(registroId, organizacionCamelCase);
            const detallesRegistro = registro ? registro.narracionEventos : '';

            if (eliminarArchivos && registro) {
                const rutaStorage = `mercancia_perdida_${organizacionCamelCase}/${registroId}`;
                await this.eliminarCarpetaStorage(rutaStorage);
            }

            const collectionName = this._getCollectionName(organizacionCamelCase);
            const registroRef = doc(db, collectionName, registroId);

            await consumo.registrarFirestoreEliminacion(collectionName, registroId);
            await deleteDoc(registroRef);

            const registroIndex = this.registros.findIndex(r => r.id === registroId);
            if (registroIndex !== -1) {
                this.registros.splice(registroIndex, 1);
            }

            if (usuarioActual) {
                const historial = await this._getHistorialManager();
                if (historial) {
                    await historial.registrarActividad({
                        usuario: usuarioActual,
                        tipo: 'eliminar',
                        modulo: 'mercancia_perdida',
                        descripcion: `Eliminó registro de mercancía ${registroId}`,
                        detalles: {
                            registroId,
                            detalles: detallesRegistro?.substring(0, 100)
                        }
                    });
                }
            }

            return true;

        } catch (error) {
            console.error('Error eliminando registro:', error);
            throw error;
        }
    }

    async getEstadisticas(organizacionCamelCase) {
        try {
            const registros = await this.getRegistrosByOrganizacion(organizacionCamelCase);

            const totalPerdido = registros.reduce((acc, r) => acc + (r.montoPerdido || 0), 0);
            const totalRecuperado = registros.reduce((acc, r) => acc + (r.montoRecuperado || 0), 0);

            return {
                total: registros.length,
                activos: registros.filter(r => r.estado === 'activo').length,
                recuperados: registros.filter(r => r.estado === 'recuperado').length,
                cerrados: registros.filter(r => r.estado === 'cerrado').length,
                porTipoEvento: {
                    robo: registros.filter(r => r.tipoEvento === 'robo').length,
                    extravio: registros.filter(r => r.tipoEvento === 'extravio').length,
                    incidencia: registros.filter(r => r.tipoEvento === 'incidencia').length,
                    otro: registros.filter(r => r.tipoEvento === 'otro').length
                },
                totalPerdido: totalPerdido,
                totalRecuperado: totalRecuperado,
                totalNeto: totalPerdido - totalRecuperado,
                porcentajeRecuperado: totalPerdido > 0 ? (totalRecuperado / totalPerdido) * 100 : 0,
                conEvidencias: registros.filter(r => (r.evidencias || []).length > 0).length,
                totalEvidencias: registros.reduce((acc, r) => acc + (r.evidencias || []).length, 0),
                // ========== NUEVAS ESTADÍSTICAS ==========
                pdfGenerados: registros.filter(r => r.pdfGenerado === true).length,
                pdfPendientes: registros.filter(r => r.estadoGeneracion === 'pendiente').length,
                pdfEnError: registros.filter(r => r.estadoGeneracion === 'error').length
            };
        } catch (error) {
            console.error('Error obteniendo estadísticas:', error);
            return null;
        }
    }

    limpiarCache() {
        this.registros = [];
    }
}

export { MercanciaPerdida, MercanciaPerdidaManager };