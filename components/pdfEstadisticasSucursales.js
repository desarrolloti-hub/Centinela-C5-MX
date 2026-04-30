/**
 * PDF ESTADISTICAS SUCURSALES - Sistema Centinela
 * VERSION: 5.1 - CORREGIDO SOLO LA PAGINACION
 * 
 * ORGANIZACION:
 * - Hoja 1: KPIs (TOTAL INCIDENCIAS, CRITICAS+ALTAS, PENDIENTES, TASA RECUPERACION)
 * - Hoja 2: Graficas principales (Niveles de riesgo + Categorias mas reportadas)
 * - Hoja 3: Tabla de incidencias recientes (ultimas 10)
 * - Hoja 4: Graficas secundarias (Tiempo promedio + Perdidas vs Recuperaciones) - SOLO si hay datos
 * 
 * MEJORAS:
 * - Cambia colores de gráficas a negro antes de capturar (para mejor visibilidad en PDF)
 * - Restaura colores originales después de generar el PDF
 * - Mayor resolución en captura de gráficas (scale: 3)
 * - PAGINACION CORREGIDA
 */

import { PDFBaseGenerator, coloresBase } from './pdf-base-generator.js';

export const coloresSucursal = {
    ...coloresBase,
    graficas: {
        riesgoCritico: '#ef4444',
        riesgoAlto: '#f97316',
        riesgoMedio: '#eab308',
        riesgoBajo: '#10b981',
        perdidas: '#ef4444',
        recuperaciones: '#10b981',
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
    ANCHO_GRAFICA: 130,
    ALTO_GRAFICA: 75,
    ALTO_GRAFICA_GRANDE: 95,
    ESPACIADO: 15
};

class PDFEstadisticasSucursalesGenerator extends PDFBaseGenerator {
    constructor() {
        super();
        this.sucursalActual = null;
        this.incidenciasSucursal = [];
        this.registrosRecuperacion = [];
        this.statsIncidencias = null;
        this.statsRecuperacion = null;
        this.datosPorRiesgo = null;
        this.datosPorCategoria = null;
        this.regionInfo = null;
        this.chartImages = {
            riesgo: null,
            perdidasRecuperacion: null
        };
        
        // Flags de disponibilidad de datos
        this.hayIncidencias = false;
        this.hayIncidenciasFinalizadas = false;
        this.hayRecuperacion = false;
        this.hayRiesgo = false;
        this.hayCategorias = false;
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
        if (config.sucursalActual) this.sucursalActual = config.sucursalActual;
        if (config.incidenciasSucursal) this.incidenciasSucursal = config.incidenciasSucursal;
        if (config.registrosRecuperacionSucursal) this.registrosRecuperacion = config.registrosRecuperacionSucursal;
        if (config.statsIncidencias) this.statsIncidencias = config.statsIncidencias;
        if (config.statsRecuperacion) this.statsRecuperacion = config.statsRecuperacion;
        if (config.datosPorRiesgo) this.datosPorRiesgo = config.datosPorRiesgo;
        if (config.datosPorCategoria) this.datosPorCategoria = config.datosPorCategoria;
        if (config.regionInfo) this.regionInfo = config.regionInfo;
        if (config.chartImages) this.chartImages = config.chartImages;
        
        this._calcularDisponibilidad();
    }

    _calcularDisponibilidad() {
        this.hayIncidencias = (this.statsIncidencias?.total || 0) > 0;
        this.hayIncidenciasFinalizadas = (this.statsIncidencias?.finalizadas || 0) > 0;
        this.hayRecuperacion = (this.statsRecuperacion?.totalPerdido || 0) > 0 || 
                               (this.statsRecuperacion?.totalRecuperado || 0) > 0;
        this.hayRiesgo = this.datosPorRiesgo && this.datosPorRiesgo.data && this.datosPorRiesgo.data.length > 0;
        this.hayCategorias = this.datosPorCategoria && this.datosPorCategoria.length > 0;
        this.hayIncidenciasRecientes = this.incidenciasSucursal && this.incidenciasSucursal.length > 0;
    }

    // =============================================
    // FUNCIONES PARA CAMBIAR COLORES DE GRÁFICAS PARA PDF
    // =============================================

    _cambiarGraficasAModoPDF() {
        if (window.graficoRiesgo && window.graficoRiesgo.options) {
            this._aplicarColoresPDF(window.graficoRiesgo);
        }
        if (window.graficoPerdidasRecuperacion && window.graficoPerdidasRecuperacion.options) {
            this._aplicarColoresPDF(window.graficoPerdidasRecuperacion);
        }
        const canvasRiesgo = document.getElementById('graficoRiesgoSucursal');
        if (canvasRiesgo && canvasRiesgo.chart) {
            this._aplicarColoresPDF(canvasRiesgo.chart);
        }
        const canvasPerdidas = document.getElementById('graficoPerdidasRecuperacion');
        if (canvasPerdidas && canvasPerdidas.chart) {
            this._aplicarColoresPDF(canvasPerdidas.chart);
        }
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
        if (chart.options.plugins && chart.options.plugins.tooltip) {
            if (chart.options.plugins.tooltip.titleColor) {
                chart.options.plugins.tooltip.titleColor = '#000000';
            }
            if (chart.options.plugins.tooltip.bodyColor) {
                chart.options.plugins.tooltip.bodyColor = '#000000';
            }
        }
        chart.update();
    }

    _restaurarGraficasAModoNormal() {
        if (window.graficoRiesgo && window.graficoRiesgo.options) {
            this._aplicarColoresOriginales(window.graficoRiesgo);
        }
        if (window.graficoPerdidasRecuperacion && window.graficoPerdidasRecuperacion.options) {
            this._aplicarColoresOriginales(window.graficoPerdidasRecuperacion);
        }
        const canvasRiesgo = document.getElementById('graficoRiesgoSucursal');
        if (canvasRiesgo && canvasRiesgo.chart) {
            this._aplicarColoresOriginales(canvasRiesgo.chart);
        }
        const canvasPerdidas = document.getElementById('graficoPerdidasRecuperacion');
        if (canvasPerdidas && canvasPerdidas.chart) {
            this._aplicarColoresOriginales(canvasPerdidas.chart);
        }
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
        if (chart.options.plugins && chart.options.plugins.tooltip) {
            if (chart.options.plugins.tooltip.titleColor) {
                chart.options.plugins.tooltip.titleColor = '#fff';
            }
            if (chart.options.plugins.tooltip.bodyColor) {
                chart.options.plugins.tooltip.bodyColor = '#ddd';
            }
        }
        chart.update();
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
        document.querySelectorAll('.badge-riesgo, .badge-estado').forEach(el => {
            el.style.setProperty('color', '#000000', 'important');
        });
        document.querySelectorAll('.footer-datetime').forEach(el => {
            el.style.setProperty('color', '#000000', 'important');
        });
        document.querySelectorAll('.sucursal-info h1, .sucursal-meta span, .region-badge').forEach(el => {
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
        document.querySelectorAll('.badge-riesgo, .badge-estado').forEach(el => {
            el.style.removeProperty('color');
        });
        document.querySelectorAll('.footer-datetime').forEach(el => {
            el.style.removeProperty('color');
        });
        document.querySelectorAll('.sucursal-info h1, .sucursal-meta span, .region-badge').forEach(el => {
            el.style.removeProperty('color');
        });
    }

    async _recapturarGraficasConNuevosColores() {
        await new Promise(resolve => setTimeout(resolve, 300));
        const canvasRiesgo = document.getElementById('graficoRiesgoSucursal');
        if (canvasRiesgo && canvasRiesgo instanceof HTMLCanvasElement) {
            try {
                const scale = 3;
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = canvasRiesgo.width * scale;
                tempCanvas.height = canvasRiesgo.height * scale;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.imageSmoothingEnabled = true;
                tempCtx.imageSmoothingQuality = 'high';
                tempCtx.drawImage(canvasRiesgo, 0, 0, tempCanvas.width, tempCanvas.height);
                this.chartImages.riesgo = tempCanvas.toDataURL('image/png', 1.0);
            } catch (error) {
                console.error('Error recapturando gráfica de riesgo:', error);
            }
        }
        const canvasPerdidas = document.getElementById('graficoPerdidasRecuperacion');
        if (canvasPerdidas && canvasPerdidas instanceof HTMLCanvasElement) {
            try {
                const scale = 3;
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = canvasPerdidas.width * scale;
                tempCanvas.height = canvasPerdidas.height * scale;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.imageSmoothingEnabled = true;
                tempCtx.imageSmoothingQuality = 'high';
                tempCtx.drawImage(canvasPerdidas, 0, 0, tempCanvas.width, tempCanvas.height);
                this.chartImages.perdidasRecuperacion = tempCanvas.toDataURL('image/png', 1.0);
            } catch (error) {
                console.error('Error recapturando gráfica de pérdidas:', error);
            }
        }
    }

    async generarReporte() {
        try {
            const tieneAlgunDato = this.hayIncidencias || this.hayRecuperacion || this.hayRiesgo || this.hayCategorias;
            
            if (!tieneAlgunDato) {
                await Swal.fire({
                    icon: 'info',
                    title: 'Sin datos para generar PDF',
                    html: `<div style="text-align: center;">
                        <i class="fas fa-chart-line" style="font-size: 48px; color: #f59e0b; margin-bottom: 16px;"></i>
                        <p>No hay informacion disponible para generar el reporte PDF.</p>
                        <p style="font-size: 0.85rem; color: #9ca3af; margin-top: 12px;">
                            Esta sucursal no tiene incidencias, registros de recuperacion o datos de graficas.
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
            
            // GENERAR CONTENIDO (las páginas se van añadiendo)
            await this._generarContenido(pdf);
            
            // ✅ CORREGIR PAGINACIÓN DESPUÉS DE GENERAR TODO
            const totalPaginasReales = pdf.internal.getNumberOfPages();
            this.totalPaginas = totalPaginasReales;
            
            // Actualizar el pie de página en TODAS las páginas con la numeración correcta
            for (let i = 1; i <= totalPaginasReales; i++) {
                pdf.setPage(i);
                this._redibujarPiePaginaConNumeroCorrecto(pdf, i, totalPaginasReales);
            }
            
            // Volver a la última página para mantener la vista
            pdf.setPage(totalPaginasReales);

            const fechaStr = this.formatearFechaArchivo();
            const nombreSucursal = this._sanitizarNombre(this.sucursalActual?.nombre || 'sucursal');
            const nombreOrganizacion = this._sanitizarNombre(this.organizacionActual?.nombre || 'organizacion');
            const nombreArchivo = `DETALLE_SUCURSAL_${nombreOrganizacion}_${nombreSucursal}_${fechaStr}.pdf`;

            await this.mostrarOpcionesDescarga(pdf, nombreArchivo);
            
            this._restaurarGraficasAModoNormal();
            this._restaurarTextosOriginales();
            
            return pdf;

        } catch (error) {
            console.error('Error generando reporte de sucursal:', error);
            this._restaurarGraficasAModoNormal();
            this._restaurarTextosOriginales();
            throw error;
        }
    }

    /**
     * ✅ NUEVO MÉTODO: Redibuja el pie de página con la numeración correcta
     */
    _redibujarPiePaginaConNumeroCorrecto(pdf, paginaActual, totalPaginas) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const altoPagina = pdf.internal.pageSize.getHeight();
        const alturaPie = 10;
        const yPosLinea = altoPagina - alturaPie - 2;
        const yPosTexto = altoPagina - 4;
        
        pdf.saveGraphicsState();
        
        // Limpiar el área del pie
        pdf.setFillColor(255, 255, 255);
        pdf.rect(0, altoPagina - alturaPie - 5, anchoPagina, alturaPie + 8, 'F');
        
        // Línea decorativa
        pdf.setDrawColor(coloresBase.secundario);
        pdf.setLineWidth(0.3);
        pdf.line(margen, yPosLinea, anchoPagina - margen, yPosLinea);
        
        // Texto izquierdo
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(7);
        pdf.setTextColor(100, 100, 100);
        pdf.text('Sistema Centinela - Reporte de Sucursal', margen, yPosTexto);
        
        // Texto derecho con número de página CORRECTO
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7);
        pdf.setTextColor(100, 100, 100);
        pdf.text(`Página ${paginaActual} de ${totalPaginas}`, anchoPagina - margen, yPosTexto, { align: 'right' });
        
        // Barra inferior
        pdf.setDrawColor(coloresBase.primario);
        pdf.setFillColor(coloresBase.primario);
        pdf.rect(0, altoPagina - 1.5, anchoPagina, 1.5, 'F');
        
        pdf.restoreGraphicsState();
    }

    _sanitizarNombre(nombre) {
        if (!nombre) return 'sucursal';
        return nombre
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9]/g, '_')
            .substring(0, 50);
    }

    async _generarContenido(pdf) {
        // =============================================
        // HOJA 1 - KPIs
        // =============================================
        if (this.hayIncidencias) {
            this.dibujarEncabezadoBase(pdf, 'REPORTE DE SUCURSAL', 'INDICADORES PRINCIPALES');
            let yPos = this.alturaEncabezado + 5;
            yPos = this._dibujarInfoSucursal(pdf, yPos);
            yPos += 8;
            yPos = this._dibujarKPIsIncidencias(pdf, yPos);
            this._dibujarAvisoPrivacidad(pdf);
            this._dibujarPiePaginaTemporal(pdf);
        }

        // =============================================
        // HOJA 2 - Graficas principales
        // =============================================
        if (this.hayRiesgo || this.hayCategorias) {
            pdf.addPage();
            this.dibujarEncabezadoBase(pdf, 'REPORTE DE SUCURSAL', 'GRAFICAS PRINCIPALES');
            let yPos = this.alturaEncabezado + 8;
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.titulo);
            pdf.setTextColor(0, 0, 0);
            pdf.text('Analisis de Riesgos y Categorias', GRID_CONFIG.MARGEN_PAGINA, yPos);
            yPos += 6;
            pdf.setDrawColor(201, 160, 61);
            pdf.setLineWidth(0.5);
            pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 2, GRID_CONFIG.MARGEN_PAGINA + 80, yPos - 2);
            yPos += 10;
            await this._dibujarGraficasPrincipales(pdf, yPos);
            this._dibujarAvisoPrivacidad(pdf);
            this._dibujarPiePaginaTemporal(pdf);
        }

        // =============================================
        // HOJA 3 - Incidencias recientes
        // =============================================
        if (this.hayIncidenciasRecientes) {
            pdf.addPage();
            this.dibujarEncabezadoBase(pdf, 'REPORTE DE SUCURSAL', 'INCIDENCIAS RECIENTES');
            let yPos = this.alturaEncabezado + 8;
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.titulo);
            pdf.setTextColor(0, 0, 0);
            pdf.text('Listado de Incidencias (Ultimas 10)', GRID_CONFIG.MARGEN_PAGINA, yPos);
            yPos += 6;
            pdf.setDrawColor(201, 160, 61);
            pdf.setLineWidth(0.5);
            pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 2, GRID_CONFIG.MARGEN_PAGINA + 70, yPos - 2);
            yPos += 10;
            yPos = this._dibujarTablaIncidenciasRecientes(pdf, yPos);
            this._dibujarAvisoPrivacidad(pdf);
            this._dibujarPiePaginaTemporal(pdf);
        }

        // =============================================
        // HOJA 4 - Graficas secundarias
        // =============================================
        const hayGraficasSecundarias = this.hayIncidenciasFinalizadas || this.hayRecuperacion;
        if (hayGraficasSecundarias) {
            pdf.addPage();
            this.dibujarEncabezadoBase(pdf, 'REPORTE DE SUCURSAL', 'METRICAS SECUNDARIAS');
            let yPos = this.alturaEncabezado + 8;
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.titulo);
            pdf.setTextColor(0, 0, 0);
            pdf.text('Tiempo de Resolucion y Recuperacion', GRID_CONFIG.MARGEN_PAGINA, yPos);
            yPos += 6;
            pdf.setDrawColor(201, 160, 61);
            pdf.setLineWidth(0.5);
            pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 2, GRID_CONFIG.MARGEN_PAGINA + 95, yPos - 2);
            yPos += 10;
            await this._dibujarGraficasSecundarias(pdf, yPos);
            this._dibujarAvisoPrivacidad(pdf);
            this._dibujarPiePaginaTemporal(pdf);
        }
    }

    /**
     * ✅ NUEVO MÉTODO: Pie de página TEMPORAL (se sobrescribirá después)
     */
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
        pdf.text('Sistema Centinela - Reporte de Sucursal', margen, yPosTexto);
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7);
        pdf.setTextColor(100, 100, 100);
        pdf.text('Procesando paginación...', anchoPagina - margen, yPosTexto, { align: 'right' });
        
        pdf.setDrawColor(coloresBase.primario);
        pdf.setFillColor(coloresBase.primario);
        pdf.rect(0, altoPagina - 1.5, anchoPagina, 1.5, 'F');
        
        pdf.restoreGraphicsState();
    }

    _dibujarInfoSucursal(pdf, yPos) {
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
        pdf.text(this.sucursalActual?.nombre || 'Sucursal', margen + 12, yPos + 14);
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.small);
        pdf.setTextColor(80, 80, 80);
        
        const ubicacion = this.sucursalActual?.getUbicacionCompleta?.() || 'Sin ubicacion';
        const contacto = this.sucursalActual?.getContactoFormateado?.() || 'Sin contacto';
        const regionNombre = this.regionInfo?.nombre || 'Sin region';
        const regionColor = this.regionInfo?.color || '#6c757d';
        
        pdf.text(ubicacion, margen + 12, yPos + 22);
        pdf.text(contacto, margen + 12, yPos + 28);
        
        pdf.setFillColor(regionColor);
        pdf.setDrawColor(regionColor);
        pdf.roundedRect(anchoPagina - margen - 70, yPos + 6, 65, 18, 9, 9, 'FD');
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(255, 255, 255);
        pdf.text(regionNombre, anchoPagina - margen - 37, yPos + 17, { align: 'center' });
        
        return yPos + 36;
    }

    _dibujarKPIsIncidencias(pdf, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoKPI = (anchoPagina - (margen * 2) - 15) / 4;
        const espacioKPI = 5;
        
        const totalIncidencias = this.statsIncidencias?.total || 0;
        const criticasAltas = this.statsIncidencias?.criticasAltas || 0;
        const pendientes = this.statsIncidencias?.pendientes || 0;
        const tasaRecuperacion = this.statsRecuperacion?.tasaRecuperacion || 0;
        
        const kpis = [
            { titulo: 'TOTAL INCIDENCIAS', valor: totalIncidencias, color: [59, 130, 246] },
            { titulo: 'CRITICAS + ALTAS', valor: criticasAltas, color: [239, 68, 68] },
            { titulo: 'PENDIENTES', valor: pendientes, color: [245, 158, 11] },
            { titulo: 'TASA RECUPERACION', valor: `${tasaRecuperacion.toFixed(1)}%`, color: [16, 185, 129] }
        ];
        
        for (let i = 0; i < kpis.length; i++) {
            const kpi = kpis[i];
            const xKPI = margen + (i * (anchoKPI + espacioKPI));
            
            pdf.setFillColor(252, 252, 252);
            pdf.setDrawColor(220, 220, 220);
            pdf.roundedRect(xKPI, yPos, anchoKPI, GRID_CONFIG.ALTURA_KPI, 3, 3, 'FD');
            
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
        
        return yPos + GRID_CONFIG.ALTURA_KPI + 5;
    }

    async _dibujarGraficasPrincipales(pdf, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        
        if (this.hayRiesgo && this.hayCategorias) {
            const anchoGrafica = (anchoPagina - (margen * 2) - GRID_CONFIG.ESPACIADO) / 2;
            await this._dibujarGraficoRiesgo(pdf, 'Niveles de riesgo', this.chartImages.riesgo, 
                margen, yPos, anchoGrafica, GRID_CONFIG.ALTO_GRAFICA);
            await this._dibujarTablaCategorias(pdf, 'Categorias mas reportadas', this.datosPorCategoria,
                margen + anchoGrafica + GRID_CONFIG.ESPACIADO, yPos, anchoGrafica, GRID_CONFIG.ALTO_GRAFICA);
        } else if (this.hayRiesgo) {
            const anchoGrafica = anchoPagina - (margen * 2) - 60;
            const xCentrado = margen + ((anchoPagina - (margen * 2) - anchoGrafica) / 2);
            await this._dibujarGraficoRiesgo(pdf, 'Niveles de riesgo', this.chartImages.riesgo, 
                xCentrado, yPos, anchoGrafica, GRID_CONFIG.ALTO_GRAFICA_GRANDE);
        } else if (this.hayCategorias) {
            const anchoGrafica = anchoPagina - (margen * 2) - 60;
            const xCentrado = margen + ((anchoPagina - (margen * 2) - anchoGrafica) / 2);
            await this._dibujarTablaCategorias(pdf, 'Categorias mas reportadas', this.datosPorCategoria,
                xCentrado, yPos, anchoGrafica, GRID_CONFIG.ALTO_GRAFICA_GRANDE);
        }
    }

    async _dibujarGraficasSecundarias(pdf, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        
        const mostrarTiempo = this.hayIncidenciasFinalizadas;
        const mostrarRecuperacion = this.hayRecuperacion;
        
        if (mostrarTiempo && mostrarRecuperacion) {
            const anchoMitad = (anchoPagina - (margen * 2) - GRID_CONFIG.ESPACIADO) / 2;
            this._dibujarTiempoPromedio(pdf, margen, yPos, anchoMitad);
            this._dibujarRecuperacion(pdf, margen + anchoMitad + GRID_CONFIG.ESPACIADO, yPos, anchoMitad);
        } else if (mostrarTiempo) {
            const ancho = anchoPagina - (margen * 2) - 60;
            const xCentrado = margen + ((anchoPagina - (margen * 2) - ancho) / 2);
            this._dibujarTiempoPromedio(pdf, xCentrado, yPos, ancho);
        } else if (mostrarRecuperacion) {
            const ancho = anchoPagina - (margen * 2) - 60;
            const xCentrado = margen + ((anchoPagina - (margen * 2) - ancho) / 2);
            this._dibujarRecuperacion(pdf, xCentrado, yPos, ancho);
        }
    }

    _dibujarTiempoPromedio(pdf, x, y, ancho) {
        const tiempoPromedio = this.statsIncidencias?.tiempoPromedio || 0;
        
        pdf.setFillColor(252, 252, 252);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(x, y, ancho, 65, 3, 3, 'FD');
        
        pdf.setFillColor(coloresBase.secundario);
        pdf.rect(x, y, ancho, 3, 'F');
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.mini);
        pdf.setTextColor(0, 0, 0);
        pdf.text('Tiempo promedio de resolucion', x + (ancho / 2), y + 8, { align: 'center' });
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(24);
        
        let tiempoColor = [16, 185, 129];
        let tiempoTexto = 'Rapido';
        if (tiempoPromedio > 72) {
            tiempoColor = [239, 68, 68];
            tiempoTexto = 'Lento';
        } else if (tiempoPromedio > 24) {
            tiempoColor = [245, 158, 11];
            tiempoTexto = 'Medio';
        }
        
        pdf.setTextColor(tiempoColor[0], tiempoColor[1], tiempoColor[2]);
        pdf.text(`${tiempoPromedio}`, x + (ancho / 2) - 25, y + 30);
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.normal);
        pdf.setTextColor(80, 80, 80);
        pdf.text('horas', x + (ancho / 2) + 8, y + 30);
        
        pdf.setFillColor(tiempoColor[0], tiempoColor[1], tiempoColor[2]);
        pdf.roundedRect(x + ancho - 55, y + 18, 48, 14, 7, 7, 'FD');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(255, 255, 255);
        pdf.text(tiempoTexto, x + ancho - 31, y + 27, { align: 'center' });
        
        let porcentajeBar = 0;
        if (tiempoPromedio > 72) {
            porcentajeBar = Math.min(100, (tiempoPromedio / 168) * 100);
        } else if (tiempoPromedio > 24) {
            porcentajeBar = Math.min(100, ((tiempoPromedio - 24) / 48) * 100);
        } else if (tiempoPromedio > 0) {
            porcentajeBar = (tiempoPromedio / 24) * 100;
        }
        
        const barraX = x + 15;
        const barraY = y + 48;
        const barraAncho = ancho - 30;
        
        pdf.setFillColor(220, 220, 220);
        pdf.rect(barraX, barraY, barraAncho, 8, 'F');
        pdf.setFillColor(tiempoColor[0], tiempoColor[1], tiempoColor[2]);
        pdf.rect(barraX, barraY, barraAncho * (porcentajeBar / 100), 8, 'F');
        
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(80, 80, 80);
        pdf.text('Rapido (<24h)', barraX + 5, barraY + 14);
        pdf.text('Medio (24-72h)', barraX + 70, barraY + 14);
        pdf.text('Lento (>72h)', barraX + 140, barraY + 14);
    }

    _dibujarRecuperacion(pdf, x, y, ancho) {
        const totalPerdido = this.statsRecuperacion?.totalPerdido || 0;
        const totalRecuperado = this.statsRecuperacion?.totalRecuperado || 0;
        const totalNeto = totalPerdido - totalRecuperado;
        const totalEventos = this.statsRecuperacion?.totalEventos || 0;
        const tasa = this.statsRecuperacion?.tasaRecuperacion || 0;
        const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 });
        
        pdf.setFillColor(252, 252, 252);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(x, y, ancho, 65, 3, 3, 'FD');
        
        pdf.setFillColor(16, 185, 129);
        pdf.rect(x, y, ancho, 3, 'F');
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.mini);
        pdf.setTextColor(0, 0, 0);
        pdf.text('Perdidas vs Recuperaciones', x + (ancho / 2), y + 8, { align: 'center' });
        
        const total = totalPerdido + totalRecuperado;
        const barraX = x + 15;
        const barraY = y + 20;
        const barraAncho = ancho - 30;
        
        pdf.setFillColor(239, 68, 68);
        pdf.rect(barraX, barraY, barraAncho * (totalPerdido / (total || 1)), 10, 'F');
        pdf.setFillColor(16, 185, 129);
        pdf.rect(barraX + (barraAncho * (totalPerdido / (total || 1))), barraY, 
                barraAncho * (totalRecuperado / (total || 1)), 10, 'F');
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10);
        pdf.setTextColor(239, 68, 68);
        pdf.text('Perdidas', barraX + 5, barraY + 8);
        pdf.setTextColor(16, 185, 129);
        pdf.text('Recuperaciones', barraX + barraAncho - 45, barraY + 8);
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.setTextColor(239, 68, 68);
        pdf.text(`Total Perdido:`, x + 15, y + 42);
        pdf.text(formatter.format(totalPerdido), x + ancho - 100, y + 42);
        
        pdf.setTextColor(16, 185, 129);
        pdf.text(`Total Recuperado:`, x + 15, y + 54);
        pdf.text(formatter.format(totalRecuperado), x + ancho - 100, y + 54);
        
        pdf.setTextColor(245, 158, 11);
        pdf.text(`Perdida Neta:`, x + 15, y + 66);
        pdf.text(formatter.format(totalNeto), x + ancho - 100, y + 66);
        
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(80, 80, 80);
        pdf.text(`Total eventos: ${totalEventos}  |  Tasa de recuperacion: ${tasa.toFixed(1)}%`, x + 15, y + 78);
    }

    _dibujarTablaIncidenciasRecientes(pdf, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoTabla = anchoPagina - (margen * 2);
        const altoPagina = pdf.internal.pageSize.getHeight();
        
        const incidenciasRecientes = [...this.incidenciasSucursal]
            .sort((a, b) => {
                const fechaA = a.fechaInicio instanceof Date ? a.fechaInicio : new Date(a.fechaInicio);
                const fechaB = b.fechaInicio instanceof Date ? b.fechaInicio : new Date(b.fechaInicio);
                return fechaB - fechaA;
            })
            .slice(0, 10);
        
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
        pdf.text(`Incidencias recientes (ultimas ${incidenciasRecientes.length})`, margen + 5, yTabla + 10);
        
        const colAnchos = { id: 38, fecha: 28, riesgo: 22, estado: 22, detalles: anchoTabla - 130 };
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
            const maxIdLength = 18;
            if (id.length > maxIdLength) id = id.substring(0, maxIdLength - 3) + '...';
            pdf.setTextColor(0, 0, 0);
            pdf.text(id, currentX, currentY);
            currentX += colAnchos.id;
            
            const fecha = inc.fechaInicio instanceof Date ? 
                inc.fechaInicio.toLocaleDateString('es-MX') : 
                (inc.fechaInicio ? new Date(inc.fechaInicio).toLocaleDateString('es-MX') : 'N/A');
            pdf.text(fecha, currentX, currentY);
            currentX += colAnchos.fecha;
            
            const riesgoTexto = inc.nivelRiesgo ? inc.nivelRiesgo.charAt(0).toUpperCase() + inc.nivelRiesgo.slice(1) : 'N/A';
            let riesgoColor = [100, 100, 100];
            if (inc.nivelRiesgo === 'critico') riesgoColor = [239, 68, 68];
            else if (inc.nivelRiesgo === 'alto') riesgoColor = [249, 115, 22];
            else if (inc.nivelRiesgo === 'medio') riesgoColor = [234, 179, 8];
            else if (inc.nivelRiesgo === 'bajo') riesgoColor = [16, 185, 129];
            
            pdf.setTextColor(riesgoColor[0], riesgoColor[1], riesgoColor[2]);
            pdf.text(riesgoTexto, currentX, currentY);
            currentX += colAnchos.riesgo;
            
            const estadoTexto = inc.estado ? inc.estado.charAt(0).toUpperCase() + inc.estado.slice(1) : 'N/A';
            let estadoColor = [100, 100, 100];
            if (inc.estado === 'finalizada') estadoColor = [16, 185, 129];
            else if (inc.estado === 'pendiente') estadoColor = [245, 158, 11];
            
            pdf.setTextColor(estadoColor[0], estadoColor[1], estadoColor[2]);
            pdf.text(estadoTexto, currentX, currentY);
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

    async _dibujarGraficoRiesgo(pdf, titulo, imagenDataURL, x, y, ancho, alto) {
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
                this._dibujarGraficoRiesgoFallback(pdf, graficaX, graficaY, graficaAncho, graficaAlto);
            }
        } else {
            this._dibujarGraficoRiesgoFallback(pdf, graficaX, graficaY, graficaAncho, graficaAlto);
        }
    }

    _dibujarGraficoRiesgoFallback(pdf, x, y, ancho, alto) {
        if (!this.datosPorRiesgo || this.datosPorRiesgo.data.length === 0) {
            this._dibujarSinDatos(pdf, x, y, ancho, alto, 'Sin datos de riesgo');
            return;
        }
        
        const datos = this.datosPorRiesgo;
        const total = datos.data.reduce((a, b) => a + b, 0);
        const colores = {
            critico: '#ef4444',
            alto: '#f97316',
            medio: '#eab308',
            bajo: '#10b981'
        };
        
        let currentX = x + 10;
        const anchoBarra = (ancho - 30) / datos.data.length;
        const maxAltura = alto - 20;
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.microMini);
        
        for (let i = 0; i < datos.data.length; i++) {
            const porcentaje = total > 0 ? (datos.data[i] / total) * 100 : 0;
            const alturaBarra = (porcentaje / 100) * maxAltura;
            const color = colores[datos.labels[i]?.toLowerCase()] || '#6c757d';
            
            pdf.setFillColor(color);
            pdf.rect(currentX, y + maxAltura - alturaBarra, anchoBarra - 2, alturaBarra, 'F');
            
            pdf.setTextColor(0, 0, 0);
            pdf.text(datos.labels[i] || 'N/A', currentX, y + maxAltura + 4);
            
            pdf.setTextColor(80, 80, 80);
            pdf.text(`${datos.data[i]}`, currentX, y + maxAltura + 10);
            
            currentX += anchoBarra;
        }
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
            this._dibujarSinDatos(pdf, x + padding, tablaY, ancho - (padding * 2), altoTabla, 'Sin datos de categorias');
            return;
        }
        
        pdf.setFillColor(26, 59, 93);
        pdf.rect(x + padding, tablaY, ancho - (padding * 2), altoFila, 'F');
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(255, 255, 255);
        pdf.text('Categoria', x + padding + 5, tablaY + 5);
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
        const yLogo = 20;
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

    // NOTA: El método dibujarPiePagina original se elimina porque ahora usamos _redibujarPiePaginaConNumeroCorrecto
    // y _dibujarPiePaginaTemporal durante la generación
}

export const generadorPDFSucursalDetalle = new PDFEstadisticasSucursalesGenerator();
export default generadorPDFSucursalDetalle;