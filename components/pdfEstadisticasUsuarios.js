/**
 * PDF ESTADISTICAS COLABORADORES - Sistema Centinela
 * VERSION: 2.0 - Mejorado (Gráficas circulares de alta calidad)
 * 
 * MEJORAS EN ESTA VERSIÓN:
 * - Captura de gráficas circulares manteniendo aspecto cuadrado 1:1
 * - Mayor resolución en captura de gráficas (scale: 4 para circulares)
 * - Prevención de deformación en donas y pasteles
 * - Fondo blanco consistente para todas las gráficas
 * - Fallback mejorado para gráficas circulares si falla la captura
 */

import { PDFBaseGenerator, coloresBase } from './pdf-base-generator.js';

export const coloresColaborador = {
    ...coloresBase,
    graficas: {
        reportadas: '#3b82f6',
        actualizadas: '#10b981',
        seguimientos: '#f59e0b',
        riesgoCritico: '#ef4444',
        riesgoAlto: '#f97316',
        riesgoMedio: '#eab308',
        riesgoBajo: '#10b981',
        pendientes: '#f59e0b',
        finalizadas: '#10b981'
    }
};

const GRID_CONFIG = {
    MARGEN_PAGINA: 15,
    ANCHO_PAGINA: 297,
    ALTO_PAGINA: 210,
    ALTURA_ENCABEZADO: 42,
    ALTURA_KPI: 32,
    ALTURA_KPI_PEQ: 28,
    ANCHO_GRAFICA: 130,
    ALTO_GRAFICA: 75,
    ALTO_GRAFICA_GRANDE: 80,           // Más bajo
    TAMANO_GRAFICA_CIRCULAR: 75,       // Un poco más ancho que alto (para que no sea perfectamente cuadrado)
    ALTO_GRAFICA_CIRCULAR: 65,         // Alto más reducido
    ESPACIADO: 15
};
class PDFEstadisticasColaboradoresGenerator extends PDFBaseGenerator {
    constructor() {
        super();
        this.colaboradorActual = null;
        this.incidenciasColaborador = [];
        this.stats = null;
        this.datosRiesgo = null;
        this.datosEstado = null;
        this.datosCategorias = null;
        this.datosTiempoCategorias = null;
        this.evolucionSemanal = null;
        this.organizacionInfo = null;
        this.chartImages = {
            evolucion: null,
            riesgo: null,
            estado: null,
            tiempoCategorias: null
        };
        
        // Flags de disponibilidad de datos
        this.hayIncidencias = false;
        this.hayRiesgo = false;
        this.hayEstado = false;
        this.hayCategorias = false;
        this.hayTiempoCategorias = false;
        this.hayEvolucion = false;
        this.hayIncidenciasRecientes = false;
        
        this.fonts = {
            tituloPrincipal: 16,
            titulo: 14,
            subtitulo: 12,
            normal: 10,
            small: 9,
            mini: 8,
            micro: 7,
            microMini: 6
        };
    }

    configurar(config) {
        if (config.organizacionActual) this.organizacionActual = config.organizacionActual;
        if (config.colaboradorActual) this.colaboradorActual = config.colaboradorActual;
        if (config.incidenciasColaborador) this.incidenciasColaborador = config.incidenciasColaborador;
        if (config.stats) this.stats = config.stats;
        if (config.datosRiesgo) this.datosRiesgo = config.datosRiesgo;
        if (config.datosEstado) this.datosEstado = config.datosEstado;
        if (config.datosCategorias) this.datosCategorias = config.datosCategorias;
        if (config.datosTiempoCategorias) this.datosTiempoCategorias = config.datosTiempoCategorias;
        if (config.evolucionSemanal) this.evolucionSemanal = config.evolucionSemanal;
        if (config.organizacionInfo) this.organizacionInfo = config.organizacionInfo;
        if (config.chartImages) this.chartImages = config.chartImages;
        
        this._calcularDisponibilidad();
    }

    _calcularDisponibilidad() {
        this.hayIncidencias = (this.stats?.total || 0) > 0;
        this.hayRiesgo = this.datosRiesgo && this.datosRiesgo.data && this.datosRiesgo.data.length > 0;
        this.hayEstado = (this.datosEstado?.pendientes || 0) > 0 || (this.datosEstado?.finalizadas || 0) > 0;
        this.hayCategorias = this.datosCategorias && this.datosCategorias.length > 0;
        this.hayTiempoCategorias = this.datosTiempoCategorias && this.datosTiempoCategorias.length > 0;
        this.hayEvolucion = this.evolucionSemanal && this.evolucionSemanal.labels && this.evolucionSemanal.labels.length > 0 &&
            (this.evolucionSemanal.reportadas?.some(v => v > 0) ||
             this.evolucionSemanal.actualizadas?.some(v => v > 0) ||
             this.evolucionSemanal.seguimientos?.some(v => v > 0));
        this.hayIncidenciasRecientes = this.incidenciasColaborador && this.incidenciasColaborador.length > 0;
    }

    // =============================================
    // FUNCIONES MEJORADAS PARA CAPTURA DE GRÁFICAS
    // =============================================

    /**
     * Captura gráfica circular (doughnut/pie) manteniendo aspecto cuadrado 1:1
     * Esta es la función clave que soluciona la deformación
     */
async _capturarGraficaCircularAltaCalidad(canvasElement, tamano = 500) {
    if (!canvasElement || !(canvasElement instanceof HTMLCanvasElement)) {
        return null;
    }
    
    return new Promise((resolve) => {
        try {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = tamano;
            tempCanvas.height = tamano;
            const tempCtx = tempCanvas.getContext('2d');
            
            // Fondo blanco
            tempCtx.fillStyle = '#ffffff';
            tempCtx.fillRect(0, 0, tamano, tamano);
            
            const originalWidth = canvasElement.width;
            const originalHeight = canvasElement.height;
            
            // Calcular tamaño para mantener proporción y centrar
            const drawSize = Math.min(tamano * 0.85, tamano - 40);
            const offsetX = (tamano - drawSize) / 2;
            const offsetY = (tamano - drawSize) / 2;
            
            const scaleX = drawSize / originalWidth;
            const scaleY = drawSize / originalHeight;
            const scale = Math.min(scaleX, scaleY);
            
            const scaledWidth = originalWidth * scale;
            const scaledHeight = originalHeight * scale;
            const finalOffsetX = offsetX + (drawSize - scaledWidth) / 2;
            const finalOffsetY = offsetY + (drawSize - scaledHeight) / 2;
            
            tempCtx.imageSmoothingEnabled = true;
            tempCtx.imageSmoothingQuality = 'high';
            tempCtx.drawImage(canvasElement, finalOffsetX, finalOffsetY, scaledWidth, scaledHeight);
            
            resolve(tempCanvas.toDataURL('image/png', 1.0));
        } catch (error) {
            console.error('Error capturando gráfica circular:', error);
            resolve(null);
        }
    });
}

    /**
     * Captura gráfica de barras/líneas con alta resolución
     */
    async _capturarGraficaAltaCalidad(canvasElement, ancho = 700, alto = 400) {
        if (!canvasElement || !(canvasElement instanceof HTMLCanvasElement)) {
            return null;
        }
        
        return new Promise((resolve) => {
            try {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = ancho;
                tempCanvas.height = alto;
                const tempCtx = tempCanvas.getContext('2d');
                
                tempCtx.fillStyle = '#ffffff';
                tempCtx.fillRect(0, 0, ancho, alto);
                
                const originalWidth = canvasElement.width;
                const originalHeight = canvasElement.height;
                
                const scaleX = ancho / originalWidth;
                const scaleY = alto / originalHeight;
                const scale = Math.min(scaleX, scaleY);
                
                const drawWidth = originalWidth * scale;
                const drawHeight = originalHeight * scale;
                const offsetX = (ancho - drawWidth) / 2;
                const offsetY = (alto - drawHeight) / 2;
                
                tempCtx.imageSmoothingEnabled = true;
                tempCtx.imageSmoothingQuality = 'high';
                tempCtx.drawImage(canvasElement, offsetX, offsetY, drawWidth, drawHeight);
                
                resolve(tempCanvas.toDataURL('image/png', 1.0));
            } catch (error) {
                console.error('Error capturando gráfica:', error);
                resolve(null);
            }
        });
    }

    // =============================================
    // FUNCIONES PARA CAMBIAR COLORES DE GRÁFICAS PARA PDF
    // =============================================

    _cambiarGraficasAModoPDF() {
        const graficasGlobales = ['graficoEvolucionMensual', 'graficoRiesgoColaborador', 
                                   'graficoEstadoColaborador', 'graficoTiempoCategorias'];
        
        graficasGlobales.forEach(nombre => {
            if (window[nombre] && window[nombre].options) {
                this._aplicarColoresPDF(window[nombre]);
            }
        });
        
        const canvasIds = ['graficoEvolucionMensual', 'graficoRiesgoColaborador', 
                           'graficoEstadoColaborador', 'graficoTiempoCategorias'];
        
        canvasIds.forEach(id => {
            const canvas = document.getElementById(id);
            if (canvas && canvas.chart) {
                this._aplicarColoresPDF(canvas.chart);
            }
        });
    }

    _aplicarColoresPDF(chart) {
        if (!chart || !chart.options) return;
        if (chart.options.scales) {
            if (chart.options.scales.y && chart.options.scales.y.ticks) {
                chart.options.scales.y.ticks.color = '#000000';
            }
            if (chart.options.scales.x && chart.options.scales.x.ticks) {
                chart.options.scales.x.ticks.color = '#000000';
            }
        }
        if (chart.options.plugins && chart.options.plugins.legend) {
            if (chart.options.plugins.legend.labels) {
                chart.options.plugins.legend.labels.color = '#000000';
            }
        }
        chart.update();
    }

    _restaurarGraficasAModoNormal() {
        const graficasGlobales = ['graficoEvolucionMensual', 'graficoRiesgoColaborador', 
                                   'graficoEstadoColaborador', 'graficoTiempoCategorias'];
        
        graficasGlobales.forEach(nombre => {
            if (window[nombre] && window[nombre].options) {
                this._aplicarColoresOriginales(window[nombre]);
            }
        });
    }

    _aplicarColoresOriginales(chart) {
        if (!chart || !chart.options) return;
        if (chart.options.scales) {
            if (chart.options.scales.y && chart.options.scales.y.ticks) {
                chart.options.scales.y.ticks.color = 'white';
            }
            if (chart.options.scales.x && chart.options.scales.x.ticks) {
                chart.options.scales.x.ticks.color = 'white';
            }
        }
        if (chart.options.plugins && chart.options.plugins.legend) {
            if (chart.options.plugins.legend.labels) {
                chart.options.plugins.legend.labels.color = 'white';
            }
        }
        chart.update();
    }

    /**
     * RECAPTURA MEJORADA - Específica para gráficas circulares
     */
 async _recapturarGraficasConNuevosColores() {
    await new Promise(resolve => setTimeout(resolve, 350));
    
    // Capturar gráfica de evolución (barras/líneas)
    const canvasEvolucion = document.getElementById('graficoEvolucionMensual');
    if (canvasEvolucion && canvasEvolucion instanceof HTMLCanvasElement) {
        this.chartImages.evolucion = await this._capturarGraficaAltaCalidad(canvasEvolucion, 700, 400);
    }
    
    // Capturar gráfica de riesgo (CIRCULAR) - CON TAMAÑO CUADRADO
    const canvasRiesgo = document.getElementById('graficoRiesgoColaborador');
    if (canvasRiesgo && canvasRiesgo instanceof HTMLCanvasElement) {
        this.chartImages.riesgo = await this._capturarGraficaCircularAltaCalidad(canvasRiesgo, 500);
    }
    
    // Capturar gráfica de estado (CIRCULAR) - CON TAMAÑO CUADRADO
    const canvasEstado = document.getElementById('graficoEstadoColaborador');
    if (canvasEstado && canvasEstado instanceof HTMLCanvasElement) {
        this.chartImages.estado = await this._capturarGraficaCircularAltaCalidad(canvasEstado, 500);
    }
    
    // Capturar gráfica de tiempo por categorías
    const canvasTiempo = document.getElementById('graficoTiempoCategorias');
    if (canvasTiempo && canvasTiempo instanceof HTMLCanvasElement) {
        this.chartImages.tiempoCategorias = await this._capturarGraficaAltaCalidad(canvasTiempo, 700, 400);
    }
}

    _prepararTextosParaPDF() {
        document.querySelectorAll('.kpi-info h3, .kpi-info p').forEach(el => {
            el.style.setProperty('color', '#000000', 'important');
        });
        document.querySelectorAll('.card-header h5, .tiempo-valor, .tiempo-unidad, .tiempo-leyenda span').forEach(el => {
            el.style.setProperty('color', '#000000', 'important');
        });
        document.querySelectorAll('.tabla-datos, .tabla-incidencias, .tabla-datos th, .tabla-incidencias th, .tabla-datos td, .tabla-incidencias td').forEach(el => {
            el.style.setProperty('color', '#000000', 'important');
        });
        document.querySelectorAll('.badge-riesgo, .badge-estado, .badge-rol').forEach(el => {
            el.style.setProperty('color', '#000000', 'important');
        });
        document.querySelectorAll('.footer-datetime').forEach(el => {
            el.style.setProperty('color', '#000000', 'important');
        });
        document.querySelectorAll('.colaborador-info h1, .colaborador-meta span, .sucursal-badge').forEach(el => {
            el.style.setProperty('color', '#000000', 'important');
        });
    }

    _restaurarTextosOriginales() {
        document.querySelectorAll('.kpi-info h3, .kpi-info p').forEach(el => {
            el.style.removeProperty('color');
        });
        document.querySelectorAll('.card-header h5, .tiempo-valor, .tiempo-unidad, .tiempo-leyenda span').forEach(el => {
            el.style.removeProperty('color');
        });
        document.querySelectorAll('.tabla-datos, .tabla-incidencias, .tabla-datos th, .tabla-incidencias th, .tabla-datos td, .tabla-incidencias td').forEach(el => {
            el.style.removeProperty('color');
        });
        document.querySelectorAll('.badge-riesgo, .badge-estado, .badge-rol').forEach(el => {
            el.style.removeProperty('color');
        });
        document.querySelectorAll('.footer-datetime').forEach(el => {
            el.style.removeProperty('color');
        });
        document.querySelectorAll('.colaborador-info h1, .colaborador-meta span, .sucursal-badge').forEach(el => {
            el.style.removeProperty('color');
        });
    }

    async generarReporte() {
        try {
            const tieneAlgunDato = this.hayIncidencias || this.hayRiesgo || this.hayEstado || 
                                   this.hayCategorias || this.hayEvolucion || this.hayTiempoCategorias;
            
            if (!tieneAlgunDato) {
                await Swal.fire({
                    icon: 'info',
                    title: 'Sin datos para generar PDF',
                    html: `<div style="text-align: center;">
                        <i class="fas fa-chart-line" style="font-size: 48px; color: #f59e0b; margin-bottom: 16px;"></i>
                        <p>No hay información disponible para generar el reporte PDF.</p>
                        <p style="font-size: 0.85rem; color: #9ca3af; margin-top: 12px;">
                            Este colaborador no tiene incidencias o datos de actividad registrados.
                        </p>
                    </div>`,
                    confirmButtonText: 'Entendido',
                    confirmButtonColor: '#3b82f6',
                    background: 'var(--color-bg-primary)',
                    color: 'white'
                });
                return null;
            }

            this._cambiarGraficasAModoPDF();
            this._prepararTextosParaPDF();
            await new Promise(resolve => setTimeout(resolve, 300));
            await this._recapturarGraficasConNuevosColores();
            await this.cargarLibrerias();
            await this.cargarLogoCentinela();
            await this.cargarLogoOrganizacion();

            const pdf = new this.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            
            await this._generarContenido(pdf);
            
            const totalPaginasReales = pdf.internal.getNumberOfPages();
            this.totalPaginas = totalPaginasReales;
            
            for (let i = 1; i <= totalPaginasReales; i++) {
                pdf.setPage(i);
                this._redibujarPiePaginaConNumeroCorrecto(pdf, i, totalPaginasReales);
            }
            
            pdf.setPage(totalPaginasReales);

            const fechaStr = this.formatearFechaArchivo();
            const nombreColaborador = this._sanitizarNombre(this.colaboradorActual?.nombre || 'colaborador');
            const nombreOrganizacion = this._sanitizarNombre(this.organizacionActual?.nombre || 'organizacion');
            const nombreArchivo = `DETALLE_COLABORADOR_${nombreOrganizacion}_${nombreColaborador}_${fechaStr}.pdf`;

            await this.mostrarOpcionesDescarga(pdf, nombreArchivo);
            
            this._restaurarGraficasAModoNormal();
            this._restaurarTextosOriginales();
            
            return pdf;

        } catch (error) {
            console.error('Error generando reporte de colaborador:', error);
            this._restaurarGraficasAModoNormal();
            this._restaurarTextosOriginales();
            throw error;
        }
    }

    _redibujarPiePaginaConNumeroCorrecto(pdf, paginaActual, totalPaginas) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const altoPagina = pdf.internal.pageSize.getHeight();
        const alturaPie = 10;
        const yPosLinea = altoPagina - alturaPie - 2;
        const yPosTexto = altoPagina - 4;
        
        pdf.saveGraphicsState();
        
        pdf.setFillColor(255, 255, 255);
        pdf.rect(0, altoPagina - alturaPie - 5, anchoPagina, alturaPie + 8, 'F');
        
        pdf.setDrawColor(coloresBase.secundario);
        pdf.setLineWidth(0.3);
        pdf.line(margen, yPosLinea, anchoPagina - margen, yPosLinea);
        
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(7);
        pdf.setTextColor(100, 100, 100);
        pdf.text('Sistema Centinela - Reporte de Colaborador', margen, yPosTexto);
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7);
        pdf.setTextColor(100, 100, 100);
        pdf.text(`Página ${paginaActual} de ${totalPaginas}`, anchoPagina - margen, yPosTexto, { align: 'right' });
        
        pdf.setDrawColor(coloresBase.primario);
        pdf.setFillColor(coloresBase.primario);
        pdf.rect(0, altoPagina - 1.5, anchoPagina, 1.5, 'F');
        
        pdf.restoreGraphicsState();
    }

    _sanitizarNombre(nombre) {
        if (!nombre) return 'colaborador';
        return nombre
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9]/g, '_')
            .substring(0, 50);
    }

    async _generarContenido(pdf) {
        // HOJA 1 - TODOS LOS KPIs (8 cuadros)
        if (this.hayIncidencias) {
            this.dibujarEncabezadoBase(pdf, 'REPORTE DE COLABORADOR', 'INDICADORES PRINCIPALES');
            let yPos = this.alturaEncabezado + 5;
            yPos = this._dibujarInfoColaborador(pdf, yPos);
            yPos += 8;
            yPos = this._dibujarTodosLosKPIs(pdf, yPos);
            this._dibujarAvisoPrivacidad(pdf);
            this._dibujarPiePaginaTemporal(pdf);
        }

        // HOJA 2 - Gráficas principales
        if (this.hayEvolucion || this.hayRiesgo) {
            pdf.addPage();
            this.dibujarEncabezadoBase(pdf, 'REPORTE DE COLABORADOR', 'GRÁFICAS PRINCIPALES');
            let yPos = this.alturaEncabezado + 8;
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.titulo);
            pdf.setTextColor(0, 0, 0);
            pdf.text('Análisis de Actividad y Riesgos', GRID_CONFIG.MARGEN_PAGINA, yPos);
            yPos += 6;
            pdf.setDrawColor(201, 160, 61);
            pdf.setLineWidth(0.5);
            pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 2, GRID_CONFIG.MARGEN_PAGINA + 80, yPos - 2);
            yPos += 12;
            await this._dibujarGraficasPrincipales(pdf, yPos);
            this._dibujarAvisoPrivacidad(pdf);
            this._dibujarPiePaginaTemporal(pdf);
        }

        // HOJA 3 - Gráficas secundarias
        if (this.hayEstado || this.hayCategorias) {
            pdf.addPage();
            this.dibujarEncabezadoBase(pdf, 'REPORTE DE COLABORADOR', 'ESTADO Y CATEGORÍAS');
            let yPos = this.alturaEncabezado + 8;
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.titulo);
            pdf.setTextColor(0, 0, 0);
            pdf.text('Estado de Incidencias y Categorías Atendidas', GRID_CONFIG.MARGEN_PAGINA, yPos);
            yPos += 6;
            pdf.setDrawColor(201, 160, 61);
            pdf.setLineWidth(0.5);
            pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 2, GRID_CONFIG.MARGEN_PAGINA + 95, yPos - 2);
            yPos += 12;
            await this._dibujarGraficasSecundarias(pdf, yPos);
            this._dibujarAvisoPrivacidad(pdf);
            this._dibujarPiePaginaTemporal(pdf);
        }

        // HOJA 4 - Tiempo por categoría e incidencias recientes
        const hayGraficasAdicionales = this.hayTiempoCategorias || this.hayIncidenciasRecientes;
        if (hayGraficasAdicionales) {
            pdf.addPage();
            this.dibujarEncabezadoBase(pdf, 'REPORTE DE COLABORADOR', 'DETALLE DE INCIDENCIAS');
            let yPos = this.alturaEncabezado + 8;
            
            if (this.hayTiempoCategorias) {
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(this.fonts.subtitulo);
                pdf.setTextColor(0, 0, 0);
                pdf.text('Tiempo Promedio de Resolución por Categoría', GRID_CONFIG.MARGEN_PAGINA, yPos);
                yPos += 6;
                pdf.setDrawColor(201, 160, 61);
                pdf.setLineWidth(0.5);
                pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 2, GRID_CONFIG.MARGEN_PAGINA + 100, yPos - 2);
                yPos += 10;
                await this._dibujarGraficoTiempoCategorias(pdf, yPos);
                yPos += GRID_CONFIG.ALTO_GRAFICA_GRANDE + 10;
            }
            
            if (this.hayIncidenciasRecientes) {
                if (this.hayTiempoCategorias && yPos > pdf.internal.pageSize.getHeight() - 80) {
                    pdf.addPage();
                    this.dibujarEncabezadoBase(pdf, 'REPORTE DE COLABORADOR', 'INCIDENCIAS RECIENTES');
                    yPos = this.alturaEncabezado + 10;
                }
                yPos = this._dibujarTablaIncidenciasRecientes(pdf, yPos);
            }
            
            this._dibujarAvisoPrivacidad(pdf);
            this._dibujarPiePaginaTemporal(pdf);
        }
    }

    _dibujarPiePaginaTemporal(pdf) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const altoPagina = pdf.internal.pageSize.getHeight();
        const alturaPie = 10;
        const yPosLinea = altoPagina - alturaPie - 2;
        const yPosTexto = altoPagina - 4;
        
        pdf.saveGraphicsState();
        
        pdf.setDrawColor(coloresBase.secundario);
        pdf.setLineWidth(0.3);
        pdf.line(margen, yPosLinea, anchoPagina - margen, yPosLinea);
        
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(7);
        pdf.setTextColor(100, 100, 100);
        pdf.text('Sistema Centinela - Reporte de Colaborador', margen, yPosTexto);
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7);
        pdf.setTextColor(100, 100, 100);
        pdf.text('Procesando paginación...', anchoPagina - margen, yPosTexto, { align: 'right' });
        
        pdf.setDrawColor(coloresBase.primario);
        pdf.setFillColor(coloresBase.primario);
        pdf.rect(0, altoPagina - 1.5, anchoPagina, 1.5, 'F');
        
        pdf.restoreGraphicsState();
    }

    _dibujarInfoColaborador(pdf, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoInfo = anchoPagina - (margen * 2);
        
        pdf.setFillColor(248, 248, 252);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(margen, yPos, anchoInfo, 32, 4, 4, 'FD');
        
        pdf.setFillColor(coloresBase.secundario);
        pdf.rect(margen, yPos, anchoInfo, 3, 'F');
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.titulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text(this.colaboradorActual?.nombre || 'Colaborador', margen + 12, yPos + 14);
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.small);
        pdf.setTextColor(80, 80, 80);
        
        const email = this.colaboradorActual?.email || 'Correo no disponible';
        const rol = 'Colaborador';
        const organizacion = this.organizacionActual?.nombre || 'Sin organización';
        
        pdf.text(`Email: ${email}`, margen + 12, yPos + 22);
        pdf.text(`Rol: ${rol}`, margen + 12, yPos + 28);
        
        pdf.setFillColor(59, 130, 246);
        pdf.setDrawColor(59, 130, 246);
        pdf.roundedRect(anchoPagina - margen - 70, yPos + 6, 65, 18, 9, 9, 'FD');
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(255, 255, 255);
        pdf.text(organizacion, anchoPagina - margen - 37, yPos + 17, { align: 'center' });
        
        return yPos + 36;
    }

    _dibujarTodosLosKPIs(pdf, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const espacioEntreFilas = 12;
        
        const anchoKPI = (anchoPagina - (margen * 2) - 15) / 4;
        const espacioKPI = 5;
        const altoKPI = GRID_CONFIG.ALTURA_KPI;
        
        const total = this.stats?.total || 0;
        const reportadas = this.stats?.reportadas || 0;
        const actualizadas = this.stats?.actualizadas || 0;
        const seguimientos = this.stats?.seguimientos || 0;
        const eficiencia = this.stats?.eficiencia || 0;
        const criticasAltas = this.stats?.criticasAltas || 0;
        const tiempoPromedio = this.stats?.tiempoPromedio || 0;
        const tasaExito = this.stats?.tasaExito || 0;
        
        // Primera fila (4 KPIs)
        const kpisFila1 = [
            { titulo: 'TOTAL INCIDENCIAS', valor: total, color: [59, 130, 246] },
            { titulo: 'INCIDENCIAS REPORTADAS', valor: reportadas, color: [59, 130, 246] },
            { titulo: 'INCIDENCIAS ACTUALIZADAS', valor: actualizadas, color: [16, 185, 129] },
            { titulo: 'SEGUIMIENTOS REALIZADOS', valor: seguimientos, color: [245, 158, 11] }
        ];
        
        for (let i = 0; i < kpisFila1.length; i++) {
            const kpi = kpisFila1[i];
            const xKPI = margen + (i * (anchoKPI + espacioKPI));
            
            pdf.setFillColor(252, 252, 252);
            pdf.setDrawColor(220, 220, 220);
            pdf.roundedRect(xKPI, yPos, anchoKPI, altoKPI, 3, 3, 'FD');
            
            pdf.setFillColor(kpi.color[0], kpi.color[1], kpi.color[2]);
            pdf.rect(xKPI, yPos, anchoKPI, 3, 'F');
            
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.micro);
            pdf.setTextColor(0, 0, 0);
            pdf.text(kpi.titulo, xKPI + 5, yPos + 11);
            
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(14);
            pdf.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
            
            let valorTexto = kpi.valor;
            if (typeof kpi.valor === 'number' && kpi.valor >= 1000) {
                valorTexto = kpi.valor.toLocaleString('es-MX');
            }
            pdf.text(valorTexto.toString(), xKPI + 5, yPos + 26);
        }
        
        // Segunda fila (4 KPIs)
        const yPosSegundaFila = yPos + altoKPI + espacioEntreFilas;
        
        const kpisFila2 = [
            { titulo: 'EFICIENCIA GENERAL', valor: `${eficiencia}%`, color: [139, 92, 246] },
            { titulo: 'CRÍTICAS + ALTAS', valor: criticasAltas, color: [239, 68, 68] },
            { titulo: 'TIEMPO PROMEDIO', valor: `${tiempoPromedio}h`, color: [245, 158, 11] },
            { titulo: 'TASA DE ÉXITO', valor: `${tasaExito}%`, color: [16, 185, 129] }
        ];
        
        for (let i = 0; i < kpisFila2.length; i++) {
            const kpi = kpisFila2[i];
            const xKPI = margen + (i * (anchoKPI + espacioKPI));
            
            pdf.setFillColor(252, 252, 252);
            pdf.setDrawColor(220, 220, 220);
            pdf.roundedRect(xKPI, yPosSegundaFila, anchoKPI, altoKPI, 3, 3, 'FD');
            
            pdf.setFillColor(kpi.color[0], kpi.color[1], kpi.color[2]);
            pdf.rect(xKPI, yPosSegundaFila, anchoKPI, 3, 'F');
            
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.micro);
            pdf.setTextColor(0, 0, 0);
            pdf.text(kpi.titulo, xKPI + 5, yPosSegundaFila + 11);
            
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(14);
            pdf.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
            pdf.text(kpi.valor.toString(), xKPI + 5, yPosSegundaFila + 26);
        }
        
        return yPosSegundaFila + altoKPI + 5;
    }

async _dibujarGraficasPrincipales(pdf, yPos) {
    const margen = GRID_CONFIG.MARGEN_PAGINA;
    const anchoPagina = pdf.internal.pageSize.getWidth();
    
    if (this.hayEvolucion && this.hayRiesgo) {
        const anchoLineas = (anchoPagina - (margen * 2) - GRID_CONFIG.ESPACIADO) / 2;
        const anchoCircular = GRID_CONFIG.TAMANO_GRAFICA_CIRCULAR;
        const altoCircular = GRID_CONFIG.ALTO_GRAFICA_CIRCULAR;
        
        await this._dibujarGraficoEvolucion(pdf, 'Evolución semanal de actividad', this.chartImages.evolucion, 
            margen, yPos, anchoLineas, GRID_CONFIG.ALTO_GRAFICA_GRANDE);
        
        await this._dibujarGraficoRiesgoCircular(pdf, 'Niveles de riesgo atendidos', this.chartImages.riesgo,
            margen + anchoLineas + GRID_CONFIG.ESPACIADO, yPos, anchoCircular, altoCircular);
            
    } else if (this.hayEvolucion) {
        const anchoGrafica = anchoPagina - (margen * 2) - 60;
        const xCentrado = margen + ((anchoPagina - (margen * 2) - anchoGrafica) / 2);
        await this._dibujarGraficoEvolucion(pdf, 'Evolución semanal de actividad', this.chartImages.evolucion,
            xCentrado, yPos, anchoGrafica, GRID_CONFIG.ALTO_GRAFICA_GRANDE);
            
    } else if (this.hayRiesgo) {
        const anchoCircular = GRID_CONFIG.TAMANO_GRAFICA_CIRCULAR + 30;
        const altoCircular = GRID_CONFIG.ALTO_GRAFICA_CIRCULAR + 15;
        const xCentrado = margen + ((anchoPagina - (margen * 2) - anchoCircular) / 2);
        await this._dibujarGraficoRiesgoCircular(pdf, 'Niveles de riesgo atendidos', this.chartImages.riesgo,
            xCentrado, yPos, anchoCircular, altoCircular);
    }
}

async _dibujarGraficasSecundarias(pdf, yPos) {
    const margen = GRID_CONFIG.MARGEN_PAGINA;
    const anchoPagina = pdf.internal.pageSize.getWidth();
    
    if (this.hayEstado && this.hayCategorias) {
        const anchoCircular = GRID_CONFIG.TAMANO_GRAFICA_CIRCULAR;
        const altoCircular = GRID_CONFIG.ALTO_GRAFICA_CIRCULAR;
        const anchoTabla = anchoPagina - (margen * 2) - anchoCircular - GRID_CONFIG.ESPACIADO;
        
        await this._dibujarGraficoEstadoCircular(pdf, 'Estado de incidencias', this.chartImages.estado,
            margen, yPos, anchoCircular, altoCircular);
            
        await this._dibujarTablaCategorias(pdf, 'Categorías más atendidas', this.datosCategorias,
            margen + anchoCircular + GRID_CONFIG.ESPACIADO, yPos, anchoTabla, altoCircular + 8);
            
    } else if (this.hayEstado) {
        const anchoCircular = GRID_CONFIG.TAMANO_GRAFICA_CIRCULAR + 30;
        const altoCircular = GRID_CONFIG.ALTO_GRAFICA_CIRCULAR + 15;
        const xCentrado = margen + ((anchoPagina - (margen * 2) - anchoCircular) / 2);
        await this._dibujarGraficoEstadoCircular(pdf, 'Estado de incidencias', this.chartImages.estado,
            xCentrado, yPos, anchoCircular, altoCircular);
            
    } else if (this.hayCategorias) {
        const anchoTabla = anchoPagina - (margen * 2);
        await this._dibujarTablaCategorias(pdf, 'Categorías más atendidas', this.datosCategorias,
            margen, yPos, anchoTabla, GRID_CONFIG.ALTO_GRAFICA_CIRCULAR + 8);
    }
}

    /**
     * DIBUJO DE GRÁFICA CIRCULAR MEJORADO - Mantiene aspecto cuadrado
     */
    async _dibujarGraficoCircular(pdf, titulo, imagenDataURL, x, y, ancho, alto, datosParaFallback = null, esEstado = false) {
        const padding = 4;
        const alturaTitulo = 14;
        
        // Asegurar que ancho y alto sean iguales para mantener la circularidad
        const size = Math.min(ancho, alto);
        const xCentrado = x + (ancho - size) / 2;
        
        pdf.setFillColor(252, 252, 252);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(x, y, ancho, alto, 3, 3, 'FD');
        
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(x + 5, y + alturaTitulo - 2, x + ancho - 5, y + alturaTitulo - 2);
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.mini);
        pdf.setTextColor(0, 0, 0);
        pdf.text(titulo, x + (ancho / 2), y + 5, { align: 'center' });
        
        const graficaX = xCentrado + padding;
        const graficaY = y + alturaTitulo + 3;
        const graficaSize = size - (padding * 2);
        
        pdf.setFillColor(255, 255, 255);
        pdf.rect(graficaX, graficaY, graficaSize, graficaSize, 'F');
        
        if (imagenDataURL) {
            try {
                // Dibujar la imagen manteniendo proporción cuadrada
                pdf.addImage(imagenDataURL, 'PNG', graficaX, graficaY, graficaSize, graficaSize);
            } catch (error) {
                console.error('Error al añadir imagen circular:', error);
                if (datosParaFallback) {
                    if (esEstado) {
                        this._dibujarGraficoEstadoFallback(pdf, graficaX, graficaY, graficaSize, graficaSize, datosParaFallback);
                    } else {
                        this._dibujarGraficoRiesgoFallback(pdf, graficaX, graficaY, graficaSize, graficaSize, datosParaFallback);
                    }
                }
            }
        } else {
            if (datosParaFallback) {
                if (esEstado) {
                    this._dibujarGraficoEstadoFallback(pdf, graficaX, graficaY, graficaSize, graficaSize, datosParaFallback);
                } else {
                    this._dibujarGraficoRiesgoFallback(pdf, graficaX, graficaY, graficaSize, graficaSize, datosParaFallback);
                }
            } else {
                this._dibujarSinDatos(pdf, graficaX, graficaY, graficaSize, graficaSize, 'Sin datos');
            }
        }
    }

    /**
     * FALLBACK MEJORADO para gráfica de riesgo (dibuja un donut circular correctamente)
     */
    _dibujarGraficoRiesgoFallback(pdf, x, y, ancho, alto, datos) {
        if (!datos || !datos.data || datos.data.length === 0) {
            this._dibujarSinDatos(pdf, x, y, ancho, alto, 'Sin datos de riesgo');
            return;
        }
        
        const centerX = x + ancho / 2;
        const centerY = y + alto / 2;
        const radius = Math.min(ancho, alto) * 0.35;
        const total = datos.data.reduce((a, b) => a + b, 0);
        const colores = datos.colors || ['#ef4444', '#f97316', '#eab308', '#10b981'];
        
        let startAngle = -Math.PI / 2;
        
        for (let i = 0; i < datos.data.length; i++) {
            if (datos.data[i] === 0) continue;
            
            const angle = (datos.data[i] / total) * 2 * Math.PI;
            const endAngle = startAngle + angle;
            
            // Dibujar segmento del donut
            const path = () => {
                pdf.ellipse(centerX, centerY, radius, radius, 0, startAngle, endAngle, false);
                pdf.lineTo(centerX, centerY);
            };
            
            pdf.setFillColor(colores[i] || '#6c757d');
            pdf.path('F', path);
            
            startAngle = endAngle;
        }
        
        // Círculo interior para efecto donut
        pdf.setFillColor(252, 252, 252);
        pdf.circle(centerX, centerY, radius * 0.6, 'F');
        
        // Texto central
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.small);
        pdf.setTextColor(0, 0, 0);
        pdf.text(total.toString(), centerX, centerY + 2, { align: 'center' });
        
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(100, 100, 100);
        pdf.text('total', centerX, centerY + 8, { align: 'center' });
        
        // Leyenda debajo
        let leyendaY = y + alto - 8;
        let leyendaX = x + 10;
        
        pdf.setFontSize(this.fonts.microMini);
        for (let i = 0; i < Math.min(datos.data.length, 4); i++) {
            const porcentaje = total > 0 ? ((datos.data[i] / total) * 100).toFixed(1) : 0;
            pdf.setFillColor(colores[i] || '#6c757d');
            pdf.rect(leyendaX, leyendaY, 6, 3, 'F');
            pdf.setTextColor(80, 80, 80);
            pdf.text(`${datos.labels[i] || 'N/A'}: ${datos.data[i]} (${porcentaje}%)`, leyendaX + 8, leyendaY + 2.5);
            leyendaY += 4;
            if (leyendaY > y + alto - 2) break;
        }
    }

    /**
     * FALLBACK MEJORADO para gráfica de estado (dibuja donut circular)
     */
    _dibujarGraficoEstadoFallback(pdf, x, y, ancho, alto, datos) {
        const pendientes = datos?.pendientes || 0;
        const finalizadas = datos?.finalizadas || 0;
        const total = pendientes + finalizadas;
        
        if (total === 0) {
            this._dibujarSinDatos(pdf, x, y, ancho, alto, 'Sin datos de estado');
            return;
        }
        
        const centerX = x + ancho / 2;
        const centerY = y + alto / 2;
        const radius = Math.min(ancho, alto) * 0.35;
        
        // Segmento de pendientes
        const pendientesAngle = (pendientes / total) * 2 * Math.PI;
        let startAngle = -Math.PI / 2;
        
        const pathPendientes = () => {
            pdf.ellipse(centerX, centerY, radius, radius, 0, startAngle, startAngle + pendientesAngle, false);
            pdf.lineTo(centerX, centerY);
        };
        
        pdf.setFillColor(245, 158, 11);
        pdf.path('F', pathPendientes);
        
        // Segmento de finalizadas
        const pathFinalizadas = () => {
            pdf.ellipse(centerX, centerY, radius, radius, 0, startAngle + pendientesAngle, startAngle + 2 * Math.PI, false);
            pdf.lineTo(centerX, centerY);
        };
        
        pdf.setFillColor(16, 185, 129);
        pdf.path('F', pathFinalizadas);
        
        // Círculo interior
        pdf.setFillColor(252, 252, 252);
        pdf.circle(centerX, centerY, radius * 0.6, 'F');
        
        // Texto central
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.small);
        pdf.setTextColor(0, 0, 0);
        pdf.text(total.toString(), centerX, centerY + 2, { align: 'center' });
        
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(100, 100, 100);
        pdf.text('total', centerX, centerY + 8, { align: 'center' });
        
        // Leyenda
        let leyendaY = y + alto - 12;
        let leyendaX = x + 10;
        
        pdf.setFillColor(245, 158, 11);
        pdf.rect(leyendaX, leyendaY, 6, 3, 'F');
        pdf.setTextColor(80, 80, 80);
        pdf.setFontSize(this.fonts.microMini);
        pdf.text(`Pendientes: ${pendientes} (${((pendientes / total) * 100).toFixed(1)}%)`, leyendaX + 8, leyendaY + 2.5);
        
        leyendaY += 4;
        pdf.setFillColor(16, 185, 129);
        pdf.rect(leyendaX, leyendaY, 6, 3, 'F');
        pdf.text(`Finalizadas: ${finalizadas} (${((finalizadas / total) * 100).toFixed(1)}%)`, leyendaX + 8, leyendaY + 2.5);
    }

    async _dibujarGraficoEvolucion(pdf, titulo, imagenDataURL, x, y, ancho, alto) {
        const padding = 4;
        const alturaTitulo = 14;
        
        pdf.setFillColor(252, 252, 252);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(x, y, ancho, alto, 3, 3, 'FD');
        
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(x + 5, y + alturaTitulo - 2, x + ancho - 5, y + alturaTitulo - 2);
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.mini);
        pdf.setTextColor(0, 0, 0);
        pdf.text(titulo, x + (ancho / 2), y + 5, { align: 'center' });
        
        const graficaX = x + padding;
        const graficaY = y + alturaTitulo + 3;
        const graficaAncho = ancho - (padding * 2);
        const graficaAlto = alto - alturaTitulo - 10;
        
        pdf.setFillColor(255, 255, 255);
        pdf.rect(graficaX, graficaY, graficaAncho, graficaAlto, 'F');
        
        if (imagenDataURL) {
            try {
                pdf.addImage(imagenDataURL, 'PNG', graficaX + 1, graficaY + 1, graficaAncho - 2, graficaAlto - 2);
            } catch (error) {
                this._dibujarGraficoEvolucionFallback(pdf, graficaX, graficaY, graficaAncho, graficaAlto);
            }
        } else {
            this._dibujarGraficoEvolucionFallback(pdf, graficaX, graficaY, graficaAncho, graficaAlto);
        }
    }

    /**
 * DIBUJA GRÁFICA CIRCULAR DE RIESGO - Mantiene forma de círculo perfecto
 */
async _dibujarGraficoRiesgoCircular(pdf, titulo, imagenDataURL, x, y, ancho, alto) {
    // Asegurar que ancho y alto sean iguales
    const size = Math.min(ancho, alto);
    const xCentrado = x + (ancho - size) / 2;
    const padding = 4;
    const alturaTitulo = 12;      // Reducido
    const alturaLeyenda = 18;     // Reducido
    
    // Alto total compacto
    const altoTotal = size + alturaTitulo + alturaLeyenda + 8;
    
    pdf.setFillColor(252, 252, 252);
    pdf.setDrawColor(200, 200, 200);
    pdf.roundedRect(x, y, ancho, altoTotal, 3, 3, 'FD');
    
    pdf.setDrawColor(201, 160, 61);
    pdf.setLineWidth(0.5);
    pdf.line(x + 5, y + alturaTitulo - 2, x + ancho - 5, y + alturaTitulo - 2);
    
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(this.fonts.micro);  // Reducido
    pdf.setTextColor(0, 0, 0);
    pdf.text(titulo, x + (ancho / 2), y + 4, { align: 'center' });
    
    // Área para la gráfica circular (centrada)
    const graficaX = xCentrado + padding;
    const graficaY = y + alturaTitulo + 2;
    const graficaSize = size - (padding * 2);
    
    pdf.setFillColor(255, 255, 255);
    pdf.rect(graficaX, graficaY, graficaSize, graficaSize, 'F');
    
    if (imagenDataURL) {
        try {
            pdf.addImage(imagenDataURL, 'PNG', graficaX, graficaY, graficaSize, graficaSize);
        } catch (error) {
            this._dibujarGraficoRiesgoFallbackCircular(pdf, graficaX, graficaY, graficaSize);
        }
    } else {
        this._dibujarGraficoRiesgoFallbackCircular(pdf, graficaX, graficaY, graficaSize);
    }
}
/**
 * DIBUJA GRÁFICA CIRCULAR DE ESTADO - Mantiene forma de círculo perfecto
 */
async _dibujarGraficoEstadoCircular(pdf, titulo, imagenDataURL, x, y, ancho, alto) {
    const padding = 4;
    const alturaTitulo = 10;
    const alturaLeyenda = 14;
    
    const altoTotal = alto + alturaTitulo + alturaLeyenda + 6;
    
    pdf.setFillColor(252, 252, 252);
    pdf.setDrawColor(200, 200, 200);
    pdf.roundedRect(x, y, ancho, altoTotal, 3, 3, 'FD');
    
    pdf.setDrawColor(201, 160, 61);
    pdf.setLineWidth(0.5);
    pdf.line(x + 5, y + alturaTitulo - 2, x + ancho - 5, y + alturaTitulo - 2);
    
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(this.fonts.micro);
    pdf.setTextColor(0, 0, 0);
    pdf.text(titulo, x + (ancho / 2), y + 4, { align: 'center' });
    
    const graficaAncho = Math.min(ancho - (padding * 2), alto - (padding * 2));
    const graficaX = x + (ancho - graficaAncho) / 2;
    const graficaY = y + alturaTitulo + 2;
    const graficaSize = graficaAncho;
    
    pdf.setFillColor(255, 255, 255);
    pdf.rect(graficaX, graficaY, graficaSize, graficaSize, 'F');
    
    if (imagenDataURL) {
        try {
            pdf.addImage(imagenDataURL, 'PNG', graficaX, graficaY, graficaSize, graficaSize);
        } catch (error) {
            this._dibujarGraficoEstadoFallbackCircular(pdf, graficaX, graficaY, graficaSize);
        }
    } else {
        this._dibujarGraficoEstadoFallbackCircular(pdf, graficaX, graficaY, graficaSize);
    }
}
/**
 * FALLBACK CIRCULAR para gráfica de riesgo - Dibuja un círculo perfecto
 */
_dibujarGraficoRiesgoFallbackCircular(pdf, x, y, size) {
    if (!this.datosRiesgo || !this.datosRiesgo.data || this.datosRiesgo.data.length === 0) {
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(this.fonts.small);
        pdf.setTextColor(150, 150, 150);
        pdf.text('Sin datos de riesgo', x + size/2, y + size/2, { align: 'center' });
        return;
    }
    
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    const radius = size * 0.35;  // Un poco más grande para mejor visualización
    const total = this.datosRiesgo.data.reduce((a, b) => a + b, 0);
    const colores = this.datosRiesgo.colors || ['#ef4444', '#f97316', '#eab308', '#10b981'];
    
    let startAngle = -Math.PI / 2;
    
    for (let i = 0; i < this.datosRiesgo.data.length; i++) {
        if (this.datosRiesgo.data[i] === 0) continue;
        
        const angle = (this.datosRiesgo.data[i] / total) * 2 * Math.PI;
        
        pdf.setFillColor(colores[i] || '#6c757d');
        
        const path = function() {
            this.ellipse(centerX, centerY, radius, radius, 0, startAngle, startAngle + angle, false);
            this.lineTo(centerX, centerY);
        }.bind(pdf);
        
        pdf.path('F', path);
        startAngle += angle;
    }
    
    pdf.setFillColor(252, 252, 252);
    pdf.circle(centerX, centerY, radius * 0.6, 'F');
    
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(this.fonts.small);
    pdf.setTextColor(0, 0, 0);
    pdf.text(total.toString(), centerX, centerY + 1, { align: 'center' });
    
    pdf.setFontSize(this.fonts.microMini);
    pdf.setTextColor(100, 100, 100);
    pdf.text('total', centerX, centerY + 6, { align: 'center' });
    
    // Leyenda horizontal compacta
    let leyendaX = x + 5;
    let leyendaY = y + size + 2;
    const espacioEntreItems = (size - 10) / Math.min(this.datosRiesgo.data.length, 4);
    
    pdf.setFontSize(this.fonts.microMini);
    for (let i = 0; i < Math.min(this.datosRiesgo.data.length, 4); i++) {
        const porcentaje = total > 0 ? ((this.datosRiesgo.data[i] / total) * 100).toFixed(0) : 0;
        pdf.setFillColor(colores[i] || '#6c757d');
        pdf.rect(leyendaX, leyendaY, 5, 2.5, 'F');
        pdf.setTextColor(80, 80, 80);
        const label = (this.datosRiesgo.labels[i] || 'N/A').substring(0, 5);
        pdf.text(`${label}: ${porcentaje}%`, leyendaX + 6, leyendaY + 2);
        leyendaX += espacioEntreItems;
    }
}

_dibujarGraficoEstadoFallbackCircular(pdf, x, y, size) {
    const pendientes = this.datosEstado?.pendientes || 0;
    const finalizadas = this.datosEstado?.finalizadas || 0;
    const total = pendientes + finalizadas;
    
    if (total === 0) {
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(this.fonts.small);
        pdf.setTextColor(150, 150, 150);
        pdf.text('Sin datos de estado', x + size/2, y + size/2, { align: 'center' });
        return;
    }
    
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    const radius = size * 0.35;
    
    const pendientesAngle = (pendientes / total) * 2 * Math.PI;
    let startAngle = -Math.PI / 2;
    
    const pathPendientes = function() {
        this.ellipse(centerX, centerY, radius, radius, 0, startAngle, startAngle + pendientesAngle, false);
        this.lineTo(centerX, centerY);
    }.bind(pdf);
    
    pdf.setFillColor(245, 158, 11);
    pdf.path('F', pathPendientes);
    
    const pathFinalizadas = function() {
        this.ellipse(centerX, centerY, radius, radius, 0, startAngle + pendientesAngle, startAngle + 2 * Math.PI, false);
        this.lineTo(centerX, centerY);
    }.bind(pdf);
    
    pdf.setFillColor(16, 185, 129);
    pdf.path('F', pathFinalizadas);
    
    pdf.setFillColor(252, 252, 252);
    pdf.circle(centerX, centerY, radius * 0.6, 'F');
    
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(this.fonts.small);
    pdf.setTextColor(0, 0, 0);
    pdf.text(total.toString(), centerX, centerY + 1, { align: 'center' });
    
    pdf.setFontSize(this.fonts.microMini);
    pdf.setTextColor(100, 100, 100);
    pdf.text('total', centerX, centerY + 6, { align: 'center' });
    
    // Leyenda horizontal compacta
    let leyendaX = x + 5;
    let leyendaY = y + size + 2;
    const espacioEntreItems = (size - 10) / 2;
    
    pdf.setFontSize(this.fonts.microMini);
    
    const porcPendientes = ((pendientes / total) * 100).toFixed(0);
    pdf.setFillColor(245, 158, 11);
    pdf.rect(leyendaX, leyendaY, 5, 2.5, 'F');
    pdf.setTextColor(80, 80, 80);
    pdf.text(`Pend: ${porcPendientes}%`, leyendaX + 6, leyendaY + 2);
    
    leyendaX += espacioEntreItems;
    const porcFinalizadas = ((finalizadas / total) * 100).toFixed(0);
    pdf.setFillColor(16, 185, 129);
    pdf.rect(leyendaX, leyendaY, 5, 2.5, 'F');
    pdf.text(`Final: ${porcFinalizadas}%`, leyendaX + 6, leyendaY + 2);
}

_dibujarGraficoEstadoFallbackCircular(pdf, x, y, size) {
    const pendientes = this.datosEstado?.pendientes || 0;
    const finalizadas = this.datosEstado?.finalizadas || 0;
    const total = pendientes + finalizadas;
    
    if (total === 0) {
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(this.fonts.small);
        pdf.setTextColor(150, 150, 150);
        pdf.text('Sin datos de estado', x + size/2, y + size/2, { align: 'center' });
        return;
    }
    
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    const radius = size * 0.32;
    
    const pendientesAngle = (pendientes / total) * 2 * Math.PI;
    let startAngle = -Math.PI / 2;
    
    const pathPendientes = function() {
        this.ellipse(centerX, centerY, radius, radius, 0, startAngle, startAngle + pendientesAngle, false);
        this.lineTo(centerX, centerY);
    }.bind(pdf);
    
    pdf.setFillColor(245, 158, 11);
    pdf.path('F', pathPendientes);
    
    const pathFinalizadas = function() {
        this.ellipse(centerX, centerY, radius, radius, 0, startAngle + pendientesAngle, startAngle + 2 * Math.PI, false);
        this.lineTo(centerX, centerY);
    }.bind(pdf);
    
    pdf.setFillColor(16, 185, 129);
    pdf.path('F', pathFinalizadas);
    
    pdf.setFillColor(252, 252, 252);
    pdf.circle(centerX, centerY, radius * 0.6, 'F');
    
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(this.fonts.small);
    pdf.setTextColor(0, 0, 0);
    pdf.text(total.toString(), centerX, centerY + 1, { align: 'center' });
    
    pdf.setFontSize(this.fonts.microMini);
    pdf.setTextColor(100, 100, 100);
    pdf.text('total', centerX, centerY + 6, { align: 'center' });
    
    // Leyenda compacta en una sola línea
    let leyendaX = x + 5;
    let leyendaY = y + size + 3;
    
    pdf.setFontSize(this.fonts.microMini);
    
    const porcPendientes = ((pendientes / total) * 100).toFixed(0);
    pdf.setFillColor(245, 158, 11);
    pdf.rect(leyendaX, leyendaY, 5, 2.5, 'F');
    pdf.setTextColor(80, 80, 80);
    pdf.text(`Pend: ${pendientes} (${porcPendientes}%)`, leyendaX + 7, leyendaY + 2);
    
    leyendaX += 55;
    const porcFinalizadas = ((finalizadas / total) * 100).toFixed(0);
    pdf.setFillColor(16, 185, 129);
    pdf.rect(leyendaX, leyendaY, 5, 2.5, 'F');
    pdf.text(`Final: ${finalizadas} (${porcFinalizadas}%)`, leyendaX + 7, leyendaY + 2);
}

/**
 * FALLBACK CIRCULAR para gráfica de estado - Dibuja un círculo perfecto
 */
_dibujarGraficoEstadoFallbackCircular(pdf, x, y, size) {
    const pendientes = this.datosEstado?.pendientes || 0;
    const finalizadas = this.datosEstado?.finalizadas || 0;
    const total = pendientes + finalizadas;
    
    if (total === 0) {
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(this.fonts.normal);
        pdf.setTextColor(150, 150, 150);
        pdf.text('Sin datos de estado', x + size/2, y + size/2, { align: 'center' });
        return;
    }
    
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    const radius = size * 0.35;
    
    // Segmento de pendientes
    const pendientesAngle = (pendientes / total) * 2 * Math.PI;
    let startAngle = -Math.PI / 2;
    
    const pathPendientes = function() {
        this.ellipse(centerX, centerY, radius, radius, 0, startAngle, startAngle + pendientesAngle, false);
        this.lineTo(centerX, centerY);
    }.bind(pdf);
    
    pdf.setFillColor(245, 158, 11);
    pdf.path('F', pathPendientes);
    
    // Segmento de finalizadas
    const pathFinalizadas = function() {
        this.ellipse(centerX, centerY, radius, radius, 0, startAngle + pendientesAngle, startAngle + 2 * Math.PI, false);
        this.lineTo(centerX, centerY);
    }.bind(pdf);
    
    pdf.setFillColor(16, 185, 129);
    pdf.path('F', pathFinalizadas);
    
    // Círculo interior
    pdf.setFillColor(252, 252, 252);
    pdf.circle(centerX, centerY, radius * 0.6, 'F');
    
    // Texto central
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(this.fonts.small);
    pdf.setTextColor(0, 0, 0);
    pdf.text(total.toString(), centerX, centerY + 2, { align: 'center' });
    
    pdf.setFontSize(this.fonts.micro);
    pdf.setTextColor(100, 100, 100);
    pdf.text('total', centerX, centerY + 8, { align: 'center' });
    
    // Leyenda
    let leyendaY = y + size + 5;
    let leyendaX = x + 10;
    
    pdf.setFontSize(this.fonts.microMini);
    
    const porcPendientes = ((pendientes / total) * 100).toFixed(1);
    pdf.setFillColor(245, 158, 11);
    pdf.rect(leyendaX, leyendaY, 6, 3, 'F');
    pdf.setTextColor(80, 80, 80);
    pdf.text(`Pendientes: ${pendientes} (${porcPendientes}%)`, leyendaX + 8, leyendaY + 2.5);
    
    leyendaY += 4;
    const porcFinalizadas = ((finalizadas / total) * 100).toFixed(1);
    pdf.setFillColor(16, 185, 129);
    pdf.rect(leyendaX, leyendaY, 6, 3, 'F');
    pdf.text(`Finalizadas: ${finalizadas} (${porcFinalizadas}%)`, leyendaX + 8, leyendaY + 2.5);
}


    _dibujarGraficoEvolucionFallback(pdf, x, y, ancho, alto) {
        if (!this.evolucionSemanal || !this.evolucionSemanal.labels || this.evolucionSemanal.labels.length === 0) {
            this._dibujarSinDatos(pdf, x, y, ancho, alto, 'Sin datos de evolución');
            return;
        }
        
        const maxValue = Math.max(
            ...(this.evolucionSemanal.reportadas || []),
            ...(this.evolucionSemanal.actualizadas || []),
            ...(this.evolucionSemanal.seguimientos || [])
        );
        
        // Eje Y
        pdf.setDrawColor(180, 180, 180);
        pdf.setLineWidth(0.3);
        pdf.line(x + 15, y + 5, x + 15, y + alto - 10);
        pdf.line(x + 15, y + alto - 10, x + ancho - 10, y + alto - 10);
        
        // Marcas del eje Y
        for (let i = 0; i <= 4; i++) {
            const valor = (maxValue * i) / 4;
            const yPos = y + alto - 10 - (i * (alto - 15) / 4);
            pdf.setFontSize(this.fonts.microMini);
            pdf.setTextColor(80, 80, 80);
            pdf.text(Math.round(valor).toString(), x + 8, yPos + 2);
        }
        
        const datasets = [
            { data: this.evolucionSemanal.reportadas || [], color: [59, 130, 246], nombre: 'Reportadas' },
            { data: this.evolucionSemanal.actualizadas || [], color: [16, 185, 129], nombre: 'Actualizadas' },
            { data: this.evolucionSemanal.seguimientos || [], color: [245, 158, 11], nombre: 'Seguimientos' }
        ];
        
        const puntosPorLabel = ancho - 40;
        const stepX = puntosPorLabel / (this.evolucionSemanal.labels.length - 1);
        
        datasets.forEach(dataset => {
            let prevX = null, prevY = null;
            
            for (let i = 0; i < dataset.data.length; i++) {
                const valor = dataset.data[i];
                const pointX = x + 25 + (i * stepX);
                const pointY = y + alto - 10 - ((valor / (maxValue || 1)) * (alto - 15));
                
                if (prevX !== null && prevY !== null && valor > 0) {
                    pdf.setDrawColor(dataset.color[0], dataset.color[1], dataset.color[2]);
                    pdf.setLineWidth(1.5);
                    pdf.line(prevX, prevY, pointX, pointY);
                }
                
                if (valor > 0) {
                    pdf.setFillColor(dataset.color[0], dataset.color[1], dataset.color[2]);
                    pdf.circle(pointX, pointY, 2, 'F');
                }
                
                prevX = pointX;
                prevY = pointY;
            }
        });
        
        // Leyenda
        let leyendaX = x + ancho - 70;
        datasets.forEach((dataset, idx) => {
            pdf.setFillColor(dataset.color[0], dataset.color[1], dataset.color[2]);
            pdf.rect(leyendaX, y + 5, 8, 4, 'F');
            pdf.setFontSize(this.fonts.microMini);
            pdf.setTextColor(0, 0, 0);
            pdf.text(dataset.nombre, leyendaX + 12, y + 9);
            leyendaX += 45;
        });
    }

    async _dibujarTablaCategorias(pdf, titulo, datosCategorias, x, y, ancho, alto) {
        const padding = 4;
        const alturaTitulo = 14;
        
        pdf.setFillColor(252, 252, 252);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(x, y, ancho, alto, 3, 3, 'FD');
        
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(x + 5, y + alturaTitulo - 2, x + ancho - 5, y + alturaTitulo - 2);
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.mini);
        pdf.setTextColor(0, 0, 0);
        pdf.text(titulo, x + (ancho / 2), y + 5, { align: 'center' });
        
        const tablaY = y + alturaTitulo + 3;
        const altoTabla = alto - alturaTitulo - 10;
        const altoFila = 8;
        
        if (!datosCategorias || datosCategorias.length === 0) {
            this._dibujarSinDatos(pdf, x + padding, tablaY, ancho - (padding * 2), altoTabla, 'Sin datos de categorías');
            return;
        }
        
        pdf.setFillColor(26, 59, 93);
        pdf.rect(x + padding, tablaY, ancho - (padding * 2), altoFila, 'F');
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(255, 255, 255);
        pdf.text('Categoría', x + padding + 5, tablaY + 5);
        pdf.text('Cantidad', x + ancho - padding - 35, tablaY + 5);
        pdf.text('%', x + ancho - padding - 12, tablaY + 5);
        
        let currentY = tablaY + altoFila;
        const total = datosCategorias.reduce((sum, c) => sum + c.cantidad, 0);
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.micro);
        
        const maxFilas = Math.min(datosCategorias.length, Math.floor((altoTabla - altoFila) / altoFila));
        
        for (let i = 0; i < maxFilas; i++) {
            const cat = datosCategorias[i];
            
            if (i % 2 === 0) {
                pdf.setFillColor(248, 248, 252);
                pdf.rect(x + padding, currentY, ancho - (padding * 2), altoFila, 'F');
            }
            
            pdf.setTextColor(0, 0, 0);
            
            let nombre = cat.nombre || 'N/A';
            const anchoDisponibleCategoria = (ancho - (padding * 2)) - 60;
            const maxCaracteres = Math.floor(anchoDisponibleCategoria / 2.5);
            if (nombre.length > maxCaracteres) nombre = nombre.substring(0, maxCaracteres - 3) + '...';
            pdf.text(nombre, x + padding + 5, currentY + 5);
            
            pdf.text(cat.cantidad.toString(), x + ancho - padding - 35, currentY + 5);
            
            const porcentaje = total > 0 ? ((cat.cantidad / total) * 100).toFixed(1) : 0;
            pdf.text(`${porcentaje}%`, x + ancho - padding - 12, currentY + 5);
            
            currentY += altoFila;
            
            if (currentY > y + alto - 8) break;
        }
    }

    async _dibujarGraficoTiempoCategorias(pdf, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoGrafica = anchoPagina - (margen * 2);
        
        const padding = 4;
        const alturaTitulo = 14;
        const alto = GRID_CONFIG.ALTO_GRAFICA_GRANDE;
        const x = margen;
        const y = yPos;
        
        pdf.setFillColor(252, 252, 252);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(x, y, anchoGrafica, alto, 3, 3, 'FD');
        
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(x + 5, y + alturaTitulo - 2, x + anchoGrafica - 5, y + alturaTitulo - 2);
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.mini);
        pdf.setTextColor(0, 0, 0);
        pdf.text('Tiempo promedio de resolución por categoría', x + (anchoGrafica / 2), y + 5, { align: 'center' });
        
        const graficaX = x + padding;
        const graficaY = y + alturaTitulo + 3;
        const graficaAncho = anchoGrafica - (padding * 2);
        const graficaAlto = alto - alturaTitulo - 10;
        
        pdf.setFillColor(255, 255, 255);
        pdf.rect(graficaX, graficaY, graficaAncho, graficaAlto, 'F');
        
        if (this.chartImages.tiempoCategorias) {
            try {
                pdf.addImage(this.chartImages.tiempoCategorias, 'PNG', graficaX + 1, graficaY + 1, graficaAncho - 2, graficaAlto - 2);
            } catch (error) {
                this._dibujarGraficoTiempoCategoriasFallback(pdf, graficaX, graficaY, graficaAncho, graficaAlto);
            }
        } else {
            this._dibujarGraficoTiempoCategoriasFallback(pdf, graficaX, graficaY, graficaAncho, graficaAlto);
        }
    }

    _dibujarGraficoTiempoCategoriasFallback(pdf, x, y, ancho, alto) {
        if (!this.datosTiempoCategorias || this.datosTiempoCategorias.length === 0) {
            this._dibujarSinDatos(pdf, x, y, ancho, alto, 'Sin datos de tiempo por categoría');
            return;
        }
        
        const datos = this.datosTiempoCategorias.slice(0, 8);
        const maxHoras = Math.max(...datos.map(d => d.promedio), 1);
        const barWidth = Math.min(35, (ancho - 60) / datos.length);
        let currentX = x + 20;
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.micro);
        
        // Eje Y
        pdf.setDrawColor(180, 180, 180);
        pdf.setLineWidth(0.3);
        pdf.line(x + 15, y + 5, x + 15, y + alto - 10);
        pdf.line(x + 15, y + alto - 10, x + ancho - 10, y + alto - 10);
        
        // Marcas del eje Y
        for (let i = 0; i <= 4; i++) {
            const valor = Math.round((maxHoras * i) / 4);
            const yPos = y + alto - 10 - (i * (alto - 15) / 4);
            pdf.setFontSize(this.fonts.microMini);
            pdf.setTextColor(80, 80, 80);
            pdf.text(valor.toString() + 'h', x + 8, yPos + 2);
        }
        
        for (let i = 0; i < datos.length; i++) {
            const cat = datos[i];
            const alturaBarra = (cat.promedio / maxHoras) * (alto - 30);
            let color = [16, 185, 129];
            if (cat.promedio > 72) color = [239, 68, 68];
            else if (cat.promedio > 24) color = [245, 158, 11];
            else if (cat.promedio > 8) color = [234, 179, 8];
            
            pdf.setFillColor(color[0], color[1], color[2]);
            pdf.rect(currentX, y + alto - 15 - alturaBarra, barWidth - 4, alturaBarra, 'F');
            
            pdf.setTextColor(0, 0, 0);
            let nombre = cat.nombre.length > 12 ? cat.nombre.substring(0, 10) + '..' : cat.nombre;
            pdf.text(nombre, currentX, y + alto - 3);
            
            pdf.setTextColor(80, 80, 80);
            pdf.text(`${cat.promedio}h`, currentX, y + alto - 20 - alturaBarra);
            
            currentX += barWidth;
        }
    }

    _dibujarTablaIncidenciasRecientes(pdf, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoTabla = anchoPagina - (margen * 2);
        const altoPagina = pdf.internal.pageSize.getHeight();
        
        const incidenciasRecientes = [...this.incidenciasColaborador]
            .sort((a, b) => {
                const fechaA = a.fechaInicio instanceof Date ? a.fechaInicio : new Date(a.fechaInicio);
                const fechaB = b.fechaInicio instanceof Date ? b.fechaInicio : new Date(b.fechaInicio);
                return fechaB - fechaA;
            })
            .slice(0, 8);
        
        if (incidenciasRecientes.length === 0) return yPos;
        
        const altoFila = 6.8;
        const headerHeight = 18;
        const footerSpace = 40;
        
        const altoNecesario = headerHeight + (incidenciasRecientes.length * altoFila) + 20;
        const altoDisponible = altoPagina - yPos - footerSpace;
        const altoTabla = Math.min(altoNecesario, altoDisponible + 10);
        
        let yTabla = yPos - 5;
        if (yTabla < this.alturaEncabezado + 5) {
            yTabla = this.alturaEncabezado + 5;
        }
        
        pdf.setFillColor(252, 252, 252);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(margen, yTabla, anchoTabla, altoTabla, 3, 3, 'FD');
        
        pdf.setFillColor(59, 130, 246);
        pdf.rect(margen, yTabla, anchoTabla, 3, 'F');
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.mini);
        pdf.setTextColor(0, 0, 0);
        pdf.text(`Incidencias recientes (últimas ${incidenciasRecientes.length})`, margen + 5, yTabla + 10);
        
        const colAnchos = { id: 35, fecha: 25, sucursal: 40, riesgo: 20, estado: 20, detalles: anchoTabla - 165 };
        let currentY = yTabla + 18;
        
        pdf.setFillColor(26, 59, 93);
        pdf.rect(margen + 3, currentY - 3, anchoTabla - 6, altoFila + 2, 'F');
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(255, 255, 255);
        
        let currentX = margen + 8;
        pdf.text('ID', currentX, currentY);
        currentX += colAnchos.id;
        pdf.text('Fecha', currentX, currentY);
        currentX += colAnchos.fecha;
        pdf.text('Sucursal', currentX, currentY);
        currentX += colAnchos.sucursal;
        pdf.text('Riesgo', currentX, currentY);
        currentX += colAnchos.riesgo;
        pdf.text('Estado', currentX, currentY);
        currentX += colAnchos.estado;
        pdf.text('Detalles', currentX, currentY);
        
        currentY += altoFila + 2;
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.micro);
        
        for (let i = 0; i < incidenciasRecientes.length; i++) {
            const inc = incidenciasRecientes[i];
            
            if (i % 2 === 0) {
                pdf.setFillColor(248, 248, 252);
                pdf.rect(margen + 3, currentY - 2.5, anchoTabla - 6, altoFila + 1.5, 'F');
            }
            
            currentX = margen + 8;
            
            let id = inc.id || 'N/A';
            if (id.length > 12) id = id.substring(0, 10) + '...';
            pdf.setTextColor(0, 0, 0);
            pdf.text(id, currentX, currentY);
            currentX += colAnchos.id;
            
            const fecha = inc.fechaInicio instanceof Date ? 
                inc.fechaInicio.toLocaleDateString('es-MX') : 
                (inc.fechaInicio ? new Date(inc.fechaInicio).toLocaleDateString('es-MX') : 'N/A');
            pdf.text(fecha, currentX, currentY);
            currentX += colAnchos.fecha;
            
            let sucursal = inc._sucursalNombre || inc.sucursalNombre || 'N/A';
            if (sucursal.length > 18) sucursal = sucursal.substring(0, 16) + '...';
            pdf.text(sucursal, currentX, currentY);
            currentX += colAnchos.sucursal;
            
            let riesgoColor = [100, 100, 100];
            if (inc.nivelRiesgo === 'critico') riesgoColor = [239, 68, 68];
            else if (inc.nivelRiesgo === 'alto') riesgoColor = [249, 115, 22];
            else if (inc.nivelRiesgo === 'medio') riesgoColor = [234, 179, 8];
            else if (inc.nivelRiesgo === 'bajo') riesgoColor = [16, 185, 129];
            
            pdf.setTextColor(riesgoColor[0], riesgoColor[1], riesgoColor[2]);
            pdf.text(inc.nivelRiesgo || 'N/A', currentX, currentY);
            currentX += colAnchos.riesgo;
            
            let estadoColor = [100, 100, 100];
            if (inc.estado === 'finalizada') estadoColor = [16, 185, 129];
            else if (inc.estado === 'pendiente') estadoColor = [245, 158, 11];
            
            pdf.setTextColor(estadoColor[0], estadoColor[1], estadoColor[2]);
            pdf.text(inc.estado || 'N/A', currentX, currentY);
            currentX += colAnchos.estado;
            
            let detalles = inc.detalles || 'Sin detalles';
            const maxDetallesLength = Math.floor(colAnchos.detalles / 1.7);
            if (detalles.length > maxDetallesLength) {
                detalles = detalles.substring(0, maxDetallesLength - 3) + '...';
            }
            pdf.setTextColor(80, 80, 80);
            pdf.text(detalles, currentX, currentY);
            
            currentY += altoFila + 1.5;
        }
        
        return yTabla + altoTabla + 8;
    }

    _dibujarSinDatos(pdf, x, y, ancho, alto, mensaje = 'Sin datos para mostrar') {
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(this.fonts.normal);
        pdf.setTextColor(150, 150, 150);
        pdf.text(mensaje, x + (ancho / 2), y + (alto / 2), { align: 'center' });
    }

    _dibujarAvisoPrivacidad(pdf) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoContenido = pdf.internal.pageSize.getWidth() - (margen * 2);
        const altoPagina = pdf.internal.pageSize.getHeight();
        const alturaAviso = 28;
        
        pdf.saveGraphicsState();
        
        pdf.setFillColor(248, 248, 248);
        pdf.rect(margen, altoPagina - alturaAviso - 6, anchoContenido, alturaAviso, 'F');
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(80, 80, 80);
        pdf.text("AVISO DE PRIVACIDAD", margen + 6, altoPagina - alturaAviso - 1);
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.micro - 0.5);
        pdf.setTextColor(120, 120, 120);
        
        const aviso = "La información contenida en este documento es responsabilidad exclusiva de quien utiliza el Sistema Centinela y de la persona que ingresó los datos. Este reporte tiene carácter informativo y puede ser utilizado como medio de prueba ante las autoridades correspondientes.";
        
        const lineasAviso = this.dividirTextoEnLineas(pdf, aviso, anchoContenido - 20);
        let yAviso = altoPagina - alturaAviso + 6;
        
        for (let i = 0; i < Math.min(lineasAviso.length, 2); i++) {
            pdf.text(lineasAviso[i], margen + 6, yAviso + (i * 4.5));
        }
        
        pdf.restoreGraphicsState();
    }

    dibujarEncabezadoBase(pdf, titulo, subtitulo) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const alturaEncabezado = this.alturaEncabezado;
        
        pdf.saveGraphicsState();
        
        pdf.setFillColor(255, 255, 255);
        pdf.rect(0, 0, anchoPagina, alturaEncabezado, 'F');
        
        pdf.setDrawColor(coloresBase.primario);
        pdf.setFillColor(coloresBase.primario);
        pdf.rect(0, 0, anchoPagina, 3, 'F');
        
        const dimensiones = this.dimensionesLogo;
        const yLogo = 18;
        const xLogoDerecha = anchoPagina - margen - (dimensiones.diametro * 2) - dimensiones.separacion;
        const xCentinela = xLogoDerecha;
        const xOrganizacion = xCentinela + dimensiones.diametro + dimensiones.separacion;
        this._dibujarLogos(pdf, xCentinela, xOrganizacion, yLogo, dimensiones.diametro / 2);
        
        pdf.setTextColor(coloresBase.primario);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.tituloPrincipal);
        pdf.text(titulo, anchoPagina / 2, 15, { align: 'center' });
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.subtitulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text(subtitulo, anchoPagina / 2, 23, { align: 'center' });
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(100, 100, 100);
        pdf.text(`Generado: ${this.formatearFecha(new Date())}`, margen, 33);
        
        pdf.setDrawColor(coloresBase.secundario);
        pdf.setLineWidth(0.5);
        pdf.line(margen, alturaEncabezado - 2, anchoPagina - margen, alturaEncabezado - 2);
        
        pdf.restoreGraphicsState();
    }
}

export const generadorPDFColaboradorDetalle = new PDFEstadisticasColaboradoresGenerator();
export default generadorPDFColaboradorDetalle;