/**
 * GENERADOR PDF BITÁCORA - Sistema Centinela
 * VERSIÓN: FINAL - CON FILTRO Y COLORES CORRECTOS
 */

import { PDFBaseGenerator, coloresBase } from './pdf-base-generator.js';

export const coloresBitacora = {
    ...coloresBase,
    actividad: '#00cfff'
};

class GeneradorPDFBitacora extends PDFBaseGenerator {
    constructor() {
        super();
        this.usuarioActual = null;
        this.actividades = [];
        this.fechaSeleccionada = null;
        this.organizacionNombre = '';
        this.baseUrl = window.location.origin;
        this.pdfUrlsCache = new Map();
    }

    configurar(config) {
        if (config.usuarioActual) this.usuarioActual = config.usuarioActual;
        if (config.organizacionActual) this.organizacionActual = config.organizacionActual;
        if (config.organizacionNombre) this.organizacionNombre = config.organizacionNombre;
        if (config.authToken) this.authToken = config.authToken;
    }

    async cargarLibrerias() {
        try {
            if (!window.jspdf) {
                await this.cargarScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
            }
            if (!window.jspdf?.autoTable) {
                await this.cargarScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.29/jspdf.plugin.autotable.min.js');
            }
            this.jsPDF = window.jspdf?.jsPDF;
            if (!this.jsPDF) throw new Error('No se pudo cargar jsPDF');
            return true;
        } catch (error) {
            console.error('Error cargando librerías:', error);
            throw error;
        }
    }

    async _obtenerPdfUrl(registroId, organizacion) {
        if (this.pdfUrlsCache.has(registroId)) {
            return this.pdfUrlsCache.get(registroId);
        }
        
        try {
            let pdfUrl = null;
            
            if (registroId.startsWith('INC-')) {
                const { IncidenciaManager } = await import('/clases/incidencia.js');
                const incidenciaManager = new IncidenciaManager();
                const incidencia = await incidenciaManager.getIncidenciaById(registroId, organizacion);
                if (incidencia && incidencia.pdfUrl) {
                    pdfUrl = incidencia.pdfUrl;
                }
            } 
            else if (registroId.startsWith('MP-')) {
                const { MercanciaPerdidaManager } = await import('/clases/mercanciaPerdida.js');
                const mpManager = new MercanciaPerdidaManager();
                const registro = await mpManager.getRegistroById(registroId, organizacion);
                if (registro && registro.pdfUrl) {
                    pdfUrl = registro.pdfUrl;
                }
            }
            
            if (pdfUrl) {
                this.pdfUrlsCache.set(registroId, pdfUrl);
                return pdfUrl;
            }
        } catch (error) {
            console.warn(`No se pudo obtener PDF para ${registroId}:`, error);
        }
        
        return null;
    }

    _limpiarDescripcion(descripcion) {
        if (!descripcion) return '';
        return descripcion
            .replace(/\$undefined/g, '')
            .replace(/undefined/g, '')
            .replace(/!''/g, '')
            .replace(/,''/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    _debeExcluirActividad(actividad) {
        const modulo = actividad.modulo || '';
        const tipo = actividad.tipo || actividad.tipoActividad || '';
        
        if (tipo === 'editar' || tipo === 'edit') {
            if (modulo === 'incidencias' || modulo === 'mercancia_perdida' || modulo === 'mercancia_p erdida') {
                return true;
            }
        }
        return false;
    }

    async generarBitacoraPDF(actividades, fecha, opciones = {}) {
        const startTime = performance.now();
        const { mostrarAlerta = true } = opciones;

        try {
            if (mostrarAlerta) {
                Swal.fire({
                    title: 'Generando PDF...',
                    text: 'Procesando información...',
                    allowOutsideClick: false,
                    didOpen: () => Swal.showLoading()
                });
            }

            const organizacion = this.usuarioActual?.organizacionCamelCase || this.organizacionActual?.camelCase;
            
            const actividadesFiltradas = actividades.filter(act => !this._debeExcluirActividad(act));
            
            const registrosIds = new Set();
            const actividadesLimpia = [];
            
            for (const act of actividadesFiltradas) {
                const actLimpia = { ...act };
                let descripcion = actLimpia.descripcion || actLimpia.accion || '';
                descripcion = this._limpiarDescripcion(descripcion);
                actLimpia.descripcionLimpia = descripcion;
                
                const incMatch = descripcion.match(/INC-\d{8}-\d{6}/i);
                const mpMatch = descripcion.match(/MP-\d{8}-\d{6}/i);
                
                if (incMatch) registrosIds.add(incMatch[0]);
                if (mpMatch) registrosIds.add(mpMatch[0]);
                
                actividadesLimpia.push(actLimpia);
            }
            
            const pdfUrlsPromises = Array.from(registrosIds).map(async (id) => {
                const url = await this._obtenerPdfUrl(id, organizacion);
                return { id, url };
            });
            
            const pdfUrlsResults = await Promise.all(pdfUrlsPromises);
            pdfUrlsResults.forEach(({ id, url }) => {
                if (url) this.pdfUrlsCache.set(id, url);
            });

            await Promise.all([
                this.cargarLibrerias(),
                this.cargarLogoCentinela(),
                this.cargarLogoOrganizacion()
            ]);

            this.actividades = actividadesLimpia;
            this.fechaSeleccionada = fecha;

            const pdf = new this.jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            this._generarBitacoraDia(pdf, actividadesLimpia, fecha);

            const fechaStr = this._formatearFechaArchivo(fecha);
            const nombreArchivo = `bitacora_${fechaStr}.pdf`;

            const endTime = performance.now();
            console.log(`PDF generado en ${(endTime - startTime).toFixed(0)}ms`);

            if (mostrarAlerta) {
                Swal.close();
                await this.mostrarOpcionesDescarga(pdf, nombreArchivo);
            }

            return pdf;

        } catch (error) {
            console.error('Error generando bitácora PDF:', error);
            if (mostrarAlerta) {
                Swal.close();
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'No se pudo generar la bitácora: ' + error.message,
                    confirmButtonColor: '#00cfff'
                });
            }
            throw error;
        }
    }

    _generarBitacoraDia(pdf, actividades, fecha) {
        const margen = 15;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoContenido = anchoPagina - (margen * 2);

        this.paginaActualReal = 1;
        this.totalPaginas = Math.max(1, Math.ceil(actividades.length / 15));

        const fechaFormateada = fecha.toLocaleDateString('es-MX', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        const fechaActual = new Date();
        const fechaActualFormateada = fechaActual.toLocaleDateString('es-MX', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        this.dibujarEncabezadoBase(
            pdf,
            'BITÁCORA DE ACTIVIDADES',
            this.organizacionActual?.nombre || 'SISTEMA CENTINELA'
        );

        let yPos = this.alturaEncabezado + 5;

        pdf.setFillColor(255, 255, 255);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(margen, yPos - 3, anchoContenido, 22, 2, 2, 'FD');

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        pdf.setTextColor(80, 80, 80);
        pdf.text('FECHA CONSULTADA', margen + 5, yPos);
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(100, 100, 100);
        pdf.text(fechaFormateada.substring(0, 35), margen + 5, yPos + 5);
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        pdf.setTextColor(80, 80, 80);
        pdf.text(`TOTAL: ${actividades.length}`, margen + 5, yPos + 10);
        
        const usuarioNombre = this.usuarioActual?.nombreCompleto || 'No especificado';
        const anchoMitad = anchoContenido / 2;
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        pdf.setTextColor(80, 80, 80);
        pdf.text('USUARIO', margen + anchoMitad + 5, yPos);
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(100, 100, 100);
        const usuarioTruncado = usuarioNombre.length > 25 ? usuarioNombre.substring(0, 22) + '...' : usuarioNombre;
        pdf.text(usuarioTruncado, margen + anchoMitad + 5, yPos + 5);
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        pdf.setTextColor(80, 80, 80);
        pdf.text('PDF GENERADO', margen + anchoMitad + 5, yPos + 10);
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7);
        pdf.setTextColor(100, 100, 100);
        pdf.text(fechaActualFormateada, margen + anchoMitad + 5, yPos + 15);

        yPos = this.alturaEncabezado + 5 + 28;

        if (actividades.length === 0) {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(11);
            pdf.setTextColor(150, 150, 150);
            pdf.text('No hay actividades registradas para esta fecha', anchoPagina / 2, yPos + 20, { align: 'center' });
        } else {
            this._dibujarTablaActividades(pdf, actividades, margen, yPos, anchoContenido);
        }

        this.dibujarPiePagina(pdf);
    }

    _extraerIdRegistro(descripcion) {
        if (!descripcion) return null;
        const patron = /(?:INC|MP)-\d{8}-\d{6}/i;
        const match = descripcion.match(patron);
        return match ? match[0] : null;
    }

    _extraerHora(fecha) {
        if (!fecha) return '--:--';
        try {
            const fechaObj = fecha.toDate ? fecha.toDate() : new Date(fecha);
            return fechaObj.toLocaleTimeString('es-MX', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
        } catch {
            return '--:--';
        }
    }

    _dibujarTablaActividades(pdf, actividades, margen, yInicio, anchoContenido) {
        const headers = [['Hora', 'Módulo', 'Tipo', 'Descripción']];
        
        const anchoHora = 20;
        const anchoModulo = 32;
        const anchoTipo = 24;
        const anchoDescripcion = anchoContenido - (anchoHora + anchoModulo + anchoTipo);

        const actividadesOrdenadas = [...actividades].sort((a, b) => {
            const fechaA = a.fecha ? (a.fecha.toDate ? a.fecha.toDate() : new Date(a.fecha)) : new Date(0);
            const fechaB = b.fecha ? (b.fecha.toDate ? b.fecha.toDate() : new Date(b.fecha)) : new Date(0);
            return fechaA - fechaB;
        });

        const bodyData = [];
        const linkPorFila = [];
        
        for (const act of actividadesOrdenadas) {
            const uiData = act.toUI ? act.toUI() : this._extraerUIData(act);
            
            let descripcion = act.descripcionLimpia || uiData.descripcion || 'Sin descripción';
            descripcion = this._limpiarDescripcion(descripcion);
            
            const registroId = this._extraerIdRegistro(descripcion);
            const pdfUrl = registroId ? this.pdfUrlsCache.get(registroId) : null;
            const tieneLink = !!pdfUrl;
            
            let modulo = (uiData.modulo || 'N/A').replace(/_/g, ' ').trim();
            
            // Determinar color: AZUL si tiene link, NEGRO si no
            const colorTexto = tieneLink ? [41, 98, 255] : [40, 40, 40];
            
            bodyData.push([
                uiData.hora || '--:--',
                modulo,
                uiData.tipo || 'N/A',
                { content: descripcion, styles: { textColor: colorTexto } }
            ]);
            
            linkPorFila.push({
                tieneLink: tieneLink,
                pdfUrl: pdfUrl
            });
        }

        pdf.autoTable({
            startY: yInicio,
            head: headers,
            body: bodyData,
            theme: 'grid',
            styles: {
                font: 'helvetica',
                fontSize: 8,
                cellPadding: 4,
                lineColor: [200, 200, 200],
                lineWidth: 0.1,
                minCellHeight: 10,
                valign: 'middle',
                halign: 'left'
            },
            headStyles: {
                fillColor: [41, 98, 255],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 8,
                halign: 'center',
                valign: 'middle'
            },
            columnStyles: {
                0: { cellWidth: anchoHora, halign: 'center' },
                1: { cellWidth: anchoModulo, halign: 'left' },
                2: { cellWidth: anchoTipo, halign: 'center' },
                3: { cellWidth: anchoDescripcion, halign: 'left' }
            },
            alternateRowStyles: {
                fillColor: [245, 245, 245]
            },
            margin: { left: margen, right: margen },
            didDrawCell: (data) => {
                if (data.column.index === 3) {
                    const linkInfo = linkPorFila[data.row.index];
                    if (linkInfo && linkInfo.tieneLink && linkInfo.pdfUrl) {
                        try {
                            pdf.link(
                                data.cell.x, 
                                data.cell.y, 
                                data.cell.width, 
                                data.cell.height, 
                                { url: linkInfo.pdfUrl }
                            );
                        } catch (e) {}
                    }
                }
            },
            didDrawPage: (data) => {
                this.paginaActualReal = data.pageNumber;
            }
        });
    }

    _extraerUIData(act) {
        return {
            id: act.id || act._id || '',
            hora: act.hora || this._extraerHora(act.fecha),
            modulo: act.modulo || 'N/A',
            tipo: act.tipo || act.tipoActividad || 'N/A',
            descripcion: act.descripcion || act.accion || 'Sin descripción'
        };
    }

    _formatearFechaArchivo(fecha) {
        if (!fecha) return '';
        try {
            const fechaObj = fecha.toDate ? fecha.toDate() : new Date(fecha);
            const year = fechaObj.getFullYear();
            const month = String(fechaObj.getMonth() + 1).padStart(2, '0');
            const day = String(fechaObj.getDate()).padStart(2, '0');
            return `${year}${month}${day}`;
        } catch {
            return '';
        }
    }
}

export const generadorBitacoraPDF = new GeneradorPDFBitacora();
export default generadorBitacoraPDF;