// evento.js - Clase para manejar eventos de paneles de control
// Versión CORREGIDA con campos reales de la colección

import { db } from '/config/firebase-config.js';
import {
    collection,
    getDocs,
    getDoc,
    doc,
    query,
    where,
    orderBy,
    limit,
    serverTimestamp,
    updateDoc,
    Timestamp
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

import consumo from '/clases/consumoFirebase.js';
import { CuentaPM } from '/clases/cuentaPM.js';

class Evento {
    constructor(id, data = {}) {
        this.id = id || data.id || null;
        
        // ========== CAMPOS REALES DE LA COLECCIÓN "eventos" ==========
        this.appointment = data.appointment || '';
        this.createdAt = this._convertirTimestamp(data.createdAt);
        this.datetime = data.datetime || '';
        this.description = data.description || '';
        this.device_type = data.device_type || '';
        this.email_asociado = data.email_asociado || '';
        this.event = data.event || 0;
        this.label = data.label || '';
        this.panel_alias = data.panel_alias || '';
        this.panel_serial = data.panel_serial || '';
        this.partitions = data.partitions || [];
        this.timestamp_numero = data.timestamp_numero || 0;
        this.timestamp_original = data.timestamp_original || '';
        this.type_id = data.type_id || 0;
        this.video = data.video || false;
        this.zone = data.zone || 0;
        this.zone_name = data.zone_name || '';
        
        // ========== CAMPOS DE ATENCIÓN (AGREGADOS POR NOSOTROS) ==========
        this.atendido = data.atendido || false;
        this.fechaAtencion = this._convertirTimestamp(data.fechaAtencion);
        this.idUsuarioAtencion = data.idUsuarioAtencion || '';
        this.nombreUsuarioAtencion = data.nombreUsuarioAtencion || '';
        this.mensajeRespuesta = data.mensajeRespuesta || '';
        this.estadoEvento = data.estadoEvento || 'pendiente'; // pendiente, atendido, ignorado
        
        // ========== METADATOS ==========
        this.fechaActualizacion = this._convertirTimestamp(data.fechaActualizacion);
    }

    _convertirTimestamp(valor) {
        if (!valor) return null;
        if (valor instanceof Date) return valor;
        if (valor && typeof valor.toDate === 'function') return valor.toDate();
        if (valor instanceof Timestamp) return valor.toDate();
        if (typeof valor === 'string' || typeof valor === 'number') {
            const fecha = new Date(valor);
            return isNaN(fecha.getTime()) ? null : fecha;
        }
        return null;
    }

    // ========== GETTERS ==========
    
    get fechaFormateada() {
        if (!this.createdAt) return 'Fecha no disponible';
        return this.createdAt.toLocaleString('es-MX', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    }

    get fechaAtencionFormateada() {
        if (!this.fechaAtencion) return null;
        return this.fechaAtencion.toLocaleString('es-MX', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });
    }

    get esAlarma() {
        // Type IDs comunes de alarma
        const alarmasTypeIds = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 
                               130, 131, 132, 133, 134, 135, 584]; // 584 = Medical Alarm
        return alarmasTypeIds.includes(this.type_id) || 
               this.description?.toLowerCase().includes('alarm');
    }

    get esRestauracion() {
        return this.description?.toLowerCase().includes('restore') || 
               this.description?.toLowerCase().includes('restauración');
    }

    get esMedicalAlarm() {
        return this.type_id === 584 || 
               this.description?.toLowerCase().includes('medical');
    }

    get prioridad() {
        if (this.type_id === 584) return 'alta'; // Medical Alarm = alta prioridad
        if (this.esAlarma) return 'alta';
        if (this.type_id >= 400 && this.type_id <= 499) return 'media'; // Apertura/cierre
        return 'baja';
    }

    get prioridadColor() {
        const colores = {
            'alta': '#e74c3c',
            'media': '#f39c12',
            'baja': '#3498db'
        };
        return colores[this.prioridad] || '#95a5a6';
    }

    get estadoBadge() {
        const estados = {
            'pendiente': { color: '#f39c12', icono: 'fa-clock', texto: 'Pendiente' },
            'atendido': { color: '#2ecc71', icono: 'fa-check-circle', texto: 'Atendido' },
            'ignorado': { color: '#95a5a6', icono: 'fa-ban', texto: 'Ignorado' }
        };
        return estados[this.estadoEvento] || estados['pendiente'];
    }

    // ========== MÉTODOS DE ATENCIÓN ==========

    async marcarComoAtendido(idUsuario, nombreUsuario, mensaje = '') {
        this.atendido = true;
        this.fechaAtencion = new Date();
        this.idUsuarioAtencion = idUsuario;
        this.nombreUsuarioAtencion = nombreUsuario;
        this.mensajeRespuesta = mensaje;
        this.estadoEvento = 'atendido';
        
        return await this._actualizarEnFirestore({
            atendido: true,
            fechaAtencion: serverTimestamp(),
            idUsuarioAtencion: idUsuario,
            nombreUsuarioAtencion: nombreUsuario,
            mensajeRespuesta: mensaje,
            estadoEvento: 'atendido',
            fechaActualizacion: serverTimestamp()
        });
    }

    async marcarComoIgnorado(idUsuario, nombreUsuario, motivo = '') {
        this.atendido = false;
        this.fechaAtencion = new Date();
        this.idUsuarioAtencion = idUsuario;
        this.nombreUsuarioAtencion = nombreUsuario;
        this.mensajeRespuesta = motivo;
        this.estadoEvento = 'ignorado';
        
        return await this._actualizarEnFirestore({
            atendido: false,
            fechaAtencion: serverTimestamp(),
            idUsuarioAtencion: idUsuario,
            nombreUsuarioAtencion: nombreUsuario,
            mensajeRespuesta: motivo,
            estadoEvento: 'ignorado',
            fechaActualizacion: serverTimestamp()
        });
    }

    async _actualizarEnFirestore(datos) {
        try {
            if (!this.id) throw new Error('El evento no tiene ID');
            
            const docRef = doc(db, "eventos", this.id);
            await consumo.registrarFirestoreActualizacion("eventos", this.id);
            await updateDoc(docRef, datos);
            return true;
        } catch (error) {
            console.error("❌ Error actualizando evento:", error);
            throw error;
        }
    }

    // ========== MÉTODOS ESTÁTICOS ==========

    /**
     * Obtener eventos por email asociado
     */
    static async obtenerPorEmailAsociado(emailAsociado, opciones = {}) {
        try {
            const {
                soloPendientes = false,
                limite = 500,
                ordenarPor = 'createdAt',
                orden = 'desc'
            } = opciones;

            const eventosRef = collection(db, "eventos");
            let restricciones = [where("email_asociado", "==", emailAsociado)];
            
            if (soloPendientes) {
                restricciones.push(where("estadoEvento", "==", "pendiente"));
            }
            
            let q = query(
                eventosRef,
                ...restricciones,
                orderBy(ordenarPor, orden),
                limit(limite)
            );
            
            await consumo.registrarFirestoreLectura("eventos", `email: ${emailAsociado}`);
            
            const snapshot = await getDocs(q);
            const eventos = [];
            
            snapshot.forEach(doc => {
                eventos.push(new Evento(doc.id, {
                    ...doc.data(),
                    id: doc.id
                }));
            });
            
            console.log(`✅ ${eventos.length} eventos para ${emailAsociado}`);
            return eventos;
            
        } catch (error) {
            console.error("❌ Error obteniendo eventos:", error);
            return [];
        }
    }

    /**
     * Obtener eventos por organización
     */
    static async obtenerPorOrganizacion(organizacionCamelCase, opciones = {}) {
        try {
            const cuentasPM = await CuentaPM.obtenerPorOrganizacion(organizacionCamelCase);
            
            if (!cuentasPM || cuentasPM.length === 0) {
                console.log(`ℹ️ No hay cuentas PM para: ${organizacionCamelCase}`);
                return [];
            }
            
            const emailsAsociados = cuentasPM.map(c => c.email).filter(email => email);
            console.log(`📧 Emails asociados:`, emailsAsociados);
            
            if (emailsAsociados.length === 0) {
                return [];
            }
            
            let todosLosEventos = [];
            
            for (const email of emailsAsociados) {
                const eventosEmail = await this.obtenerPorEmailAsociado(email, opciones);
                todosLosEventos = [...todosLosEventos, ...eventosEmail];
            }
            
            // Ordenar por fecha
            todosLosEventos.sort((a, b) => {
                const fechaA = a.createdAt || new Date(0);
                const fechaB = b.createdAt || new Date(0);
                return fechaB - fechaA;
            });
            
            console.log(`✅ Total eventos: ${todosLosEventos.length}`);
            return todosLosEventos;
            
        } catch (error) {
            console.error("❌ Error obteniendo eventos por organización:", error);
            return [];
        }
    }

    /**
     * Obtener un evento por ID
     */
    static async obtenerPorId(id) {
        try {
            const docRef = doc(db, "eventos", id);
            await consumo.registrarFirestoreLectura("eventos", id);
            
            const docSnap = await getDoc(docRef);
            if (!docSnap.exists()) return null;
            
            return new Evento(id, { ...docSnap.data(), id });
        } catch (error) {
            console.error("❌ Error obteniendo evento:", error);
            return null;
        }
    }

    /**
     * Obtener estadísticas
     */
    static async obtenerEstadisticas(organizacionCamelCase) {
        try {
            const eventos = await this.obtenerPorOrganizacion(organizacionCamelCase, { limite: 1000 });
            
            const stats = {
                total: eventos.length,
                pendientes: eventos.filter(e => e.estadoEvento === 'pendiente').length,
                atendidos: eventos.filter(e => e.estadoEvento === 'atendido').length,
                ignorados: eventos.filter(e => e.estadoEvento === 'ignorado').length,
                alarmas: eventos.filter(e => e.esAlarma).length,
                medicalAlarms: eventos.filter(e => e.type_id === 584).length,
                porPanel: {},
                porEmail: {},
                porDia: {}
            };
            
            eventos.forEach(evento => {
                // Panel
                const panel = evento.panel_serial || 'Desconocido';
                stats.porPanel[panel] = (stats.porPanel[panel] || 0) + 1;
                
                // Email
                const email = evento.email_asociado || 'Desconocido';
                stats.porEmail[email] = (stats.porEmail[email] || 0) + 1;
                
                // Día
                if (evento.createdAt) {
                    const fecha = evento.createdAt.toISOString().split('T')[0];
                    stats.porDia[fecha] = (stats.porDia[fecha] || 0) + 1;
                }
            });
            
            return stats;
            
        } catch (error) {
            console.error("❌ Error obteniendo estadísticas:", error);
            return null;
        }
    }
}

export { Evento };