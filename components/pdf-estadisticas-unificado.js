/**
 * PDF ESTADÍSTICAS UNIFICADO - Sistema Centinela
 * VERSIÓN: 9.0 - HORIZONTAL CON TABLAS CORREGIDAS (Páginas 6 y 7 arregladas)
 * Páginas 1-5: SIN CAMBIOS
 * Página 6: Resumen por sucursal (AHORA SÍ se ve)
 * Página 7: Desempeño (Colaboradores + Categorías) (AHORA SÍ se ve)
 */

import { PDFBaseGenerator, coloresBase } from './pdf-base-generator.js';

export const coloresUnificados = {
    ...coloresBase,
    graficas: {
        actualizadores: '#3b82f6',
        reportadores: '#10b981',
        seguimientos: '#f97316',
        estadoPendiente: '#f97316',
        estadoFinalizada: '#10b981',
        riesgoCritico: '#ef4444',
        riesgoAlto: '#f97316',
        riesgoMedio: '#eab308',
        riesgoBajo: '#10b981',
        categorias: '#8b5cf6',
        sucursales: '#14b8a6',
        tiempo: '#ec4899',
        desempeno: '#8b5cf6',
        perdidas: '#ef4444',
        recuperaciones: '#10b981',
        neto: '#f59e0b',
        porcentaje: '#3b82f6',
        eventos: '#8b5cf6',
        promedio: '#ec4899',
        robo: '#ef4444',
        extravio: '#f59e0b',
        accidente: '#3b82f6',
        otro: '#8b5cf6',
        topSucursales: '#FF6600',
        mapaCalor: '#00cfff'
    }
};

const GRID_CONFIG = {
    ANCHO_CONTENEDOR: 130,
    ALTO_CONTENEDOR: 58,
    ALTO_CONTENEDOR_CIRCULAR: 75,
    MARGEN_PAGINA: 15,
    ESPACIADO_HORIZONTAL: 12,
    ESPACIADO_VERTICAL: 10,
    ALTURA_TITULO: 9,
    ALTURA_GRAFICA: 45,
    ALTURA_LEYENDA: 12,
    ALTURA_FILTROS: 10,
    ALTURA_KPI: 30,
    ALTURA_METRICA: 38,
    ANCHO_PAGINA: 297,
    ALTO_PAGINA: 210
};

class PDFEstadisticasUnificadoGenerator extends PDFBaseGenerator {
    constructor() {
        super();
        this.datosIncidencias = null;
        this.datosRecuperacion = null;
        this.datosMapaCalor = null;
        this.metricasIncidencias = null;
        this.estadisticasRecuperacion = null;
        this.sucursalesRecuperacion = [];
        this.filtrosAplicados = {};
        this.fechaInicio = null;
        this.fechaFin = null;
        this.colaboradoresData = [];
        this.categoriasData = [];
        
        this.sucursalesCache = [];
        this.categoriasCache = [];
        this.usuariosCache = [];

        this.graficasCapturadas = {
            actualizadores: null,
            reportadores: null,
            seguimientos: null,
            estado: null,
            riesgo: null,
            categorias: null,
            sucursalesIncidencias: null,
            tiempoResolucion: null,
            tipoEvento: null,
            evolucionMensual: null,
            topSucursalesRecuperacion: null,
            comparativa: null,
            mapaCalor: null,
            graficoTopUbicaciones: null,
            tablaMapaCalor: null
        };

        this.fonts = {
            tituloPrincipal: 15,
            titulo: 13,
            subtitulo: 11,
            normal: 10,
            small: 9,
            mini: 8,
            micro: 7
        };
    }

    configurar(config) {
        if (config.organizacionActual) this.organizacionActual = config.organizacionActual;
        if (config.sucursalesCache) this.sucursalesCache = config.sucursalesCache;
        if (config.categoriasCache) this.categoriasCache = config.categoriasCache;
        if (config.usuariosCache) this.usuariosCache = config.usuariosCache;
        if (config.authToken) this.authToken = config.authToken;
    }

  async capturarTodasLasGraficas() {
    const incidenciasCanvasIds = [
        { id: 'graficoActualizadores', key: 'actualizadores' },
        { id: 'graficoReportadores', key: 'reportadores' },
        { id: 'graficoSeguimientos', key: 'seguimientos' },
        { id: 'graficoEstado', key: 'estado' },
        { id: 'graficoRiesgo', key: 'riesgo' },
        { id: 'graficoCategorias', key: 'categorias' },
        { id: 'graficoSucursales', key: 'sucursalesIncidencias' },
        { id: 'graficoTiempo', key: 'tiempoResolucion' }
    ];

    for (const item of incidenciasCanvasIds) {
        const canvas = document.getElementById(item.id);
        if (canvas && canvas instanceof HTMLCanvasElement) {
            try {
                const scale = 2;
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = canvas.width * scale;
                tempCanvas.height = canvas.height * scale;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
                this.graficasCapturadas[item.key] = tempCanvas.toDataURL('image/png', 1.0);
            } catch (error) {
                console.error(`Error capturando gráfica ${item.id}:`, error);
                this.graficasCapturadas[item.key] = null;
            }
        } else {
            this.graficasCapturadas[item.key] = null;
        }
    }

    const recuperacionCanvasIds = [
        { id: 'graficoTipoEvento', key: 'tipoEvento' },
        { id: 'graficoEvolucionMensual', key: 'evolucionMensual' },
        { id: 'graficoTopSucursales', key: 'topSucursalesRecuperacion' },
        { id: 'graficoComparativa', key: 'comparativa' }
    ];

    for (const item of recuperacionCanvasIds) {
        const canvas = document.getElementById(item.id);
        if (canvas && canvas instanceof HTMLCanvasElement) {
            try {
                const scale = 2;
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = canvas.width * scale;
                tempCanvas.height = canvas.height * scale;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
                this.graficasCapturadas[item.key] = tempCanvas.toDataURL('image/png', 1.0);
            } catch (error) {
                console.error(`Error capturando gráfica ${item.id}:`, error);
                this.graficasCapturadas[item.key] = null;
            }
        } else {
            this.graficasCapturadas[item.key] = null;
        }
    }

    // ========== CAPTURA DEL MAPA DE CALOR - SOLO OCULTAR LOS CÍRCULOS GRANDES ==========
    const mapaElement = document.getElementById('mapaCalorComponente');
    if (mapaElement && mapaElement instanceof HTMLElement) {
        try {
            if (typeof html2canvas !== 'undefined') {
                await new Promise(resolve => setTimeout(resolve, 200));
                
                // Buscar SOLO los círculos grandes (los que tienen fill-opacity="0.15" o radio grande)
                // Una forma más segura: buscar círculos que NO sean los marcadores
                // Los marcadores generalmente son imágenes (img) o tienen la clase leaflet-marker-icon
                const todosLosPaths = mapaElement.querySelectorAll('path');
                const estilosOriginales = [];
                
                todosLosPaths.forEach(path => {
                    // Verificar si es un círculo grande (no un marcador)
                    // Los círculos de calor tienen fill-opacity ~0.15 y stroke-opacity ~0.4
                    const fillOpacity = path.getAttribute('fill-opacity');
                    const strokeOpacity = path.getAttribute('stroke-opacity');
                    const radioMatch = path.getAttribute('d')?.match(/a(\d+),(\d+)/i);
                    const radio = radioMatch ? parseInt(radioMatch[1]) : 0;
                    
                    // Si tiene fill-opacity bajo (0.15) y radio grande (>30), es un círculo de calor
                    if ((fillOpacity === '0.15' || parseFloat(fillOpacity) === 0.15) && radio > 30) {
                        estilosOriginales.push({
                            elemento: path,
                            fillOpacity: fillOpacity,
                            strokeOpacity: strokeOpacity
                        });
                        // Ocultar SOLO estos círculos
                        path.setAttribute('fill-opacity', '0');
                        path.setAttribute('stroke-opacity', '0');
                    }
                });
                
                // También buscar círculos marcadores con fill-opacity 0.15
                const circulosMarcadores = mapaElement.querySelectorAll('circle');
                circulosMarcadores.forEach(circle => {
                    const fillOpacity = circle.getAttribute('fill-opacity');
                    if (fillOpacity === '0.15' || parseFloat(fillOpacity) === 0.15) {
                        estilosOriginales.push({
                            elemento: circle,
                            fillOpacity: fillOpacity,
                            strokeOpacity: circle.getAttribute('stroke-opacity')
                        });
                        circle.setAttribute('fill-opacity', '0');
                        circle.setAttribute('stroke-opacity', '0');
                    }
                });
                
                await new Promise(resolve => setTimeout(resolve, 50));
                
                const canvas = await html2canvas(mapaElement, {
                    scale: 2,
                    backgroundColor: '#1a1a2e',
                    useCORS: true,
                    logging: false,
                    onclone: (clonedDoc, element) => {
                        // En el clon, también ocultar SOLO los círculos de calor
                        const clonedPaths = clonedDoc.querySelectorAll('path');
                        clonedPaths.forEach(path => {
                            const fillOpacity = path.getAttribute('fill-opacity');
                            const radioMatch = path.getAttribute('d')?.match(/a(\d+),(\d+)/i);
                            const radio = radioMatch ? parseInt(radioMatch[1]) : 0;
                            if ((fillOpacity === '0.15' || parseFloat(fillOpacity) === 0.15) && radio > 30) {
                                path.setAttribute('fill-opacity', '0');
                                path.setAttribute('stroke-opacity', '0');
                            }
                        });
                        
                        const clonedCircles = clonedDoc.querySelectorAll('circle');
                        clonedCircles.forEach(circle => {
                            const fillOpacity = circle.getAttribute('fill-opacity');
                            if (fillOpacity === '0.15' || parseFloat(fillOpacity) === 0.15) {
                                circle.setAttribute('fill-opacity', '0');
                                circle.setAttribute('stroke-opacity', '0');
                            }
                        });
                    }
                });
                
                // Restaurar los círculos
                estilosOriginales.forEach(original => {
                    if (original.fillOpacity) original.elemento.setAttribute('fill-opacity', original.fillOpacity);
                    if (original.strokeOpacity) original.elemento.setAttribute('stroke-opacity', original.strokeOpacity);
                });
                
                this.graficasCapturadas.mapaCalor = canvas.toDataURL('image/png', 1.0);
            }
        } catch (error) {
            console.error('Error capturando mapa de calor:', error);
            this.graficasCapturadas.mapaCalor = null;
        }
    }

    const graficoTopMapa = document.getElementById('mapaGraficoTop');
    if (graficoTopMapa && graficoTopMapa instanceof HTMLCanvasElement) {
        try {
            const scale = 2;
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = graficoTopMapa.width * scale;
            tempCanvas.height = graficoTopMapa.height * scale;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(graficoTopMapa, 0, 0, tempCanvas.width, tempCanvas.height);
            this.graficasCapturadas.graficoTopUbicaciones = tempCanvas.toDataURL('image/png', 1.0);
        } catch (error) {
            console.error('Error capturando gráfica top del mapa:', error);
            this.graficasCapturadas.graficoTopUbicaciones = null;
        }
    }
}

    configurarDatos(datos) {
        this.datosIncidencias = datos.datosIncidencias;
        this.datosRecuperacion = datos.datosRecuperacion;
        this.datosMapaCalor = datos.datosMapaCalor || null;
        
        if (this.datosIncidencias) {
            this.metricasIncidencias = this.datosIncidencias.metricas;
            this.colaboradoresData = this.datosIncidencias.colaboradores || [];
            this.categoriasData = this.datosIncidencias.categoriasData || [];
        }
        
        if (this.datosRecuperacion) {
            this.estadisticasRecuperacion = this.datosRecuperacion.estadisticas;
            this.sucursalesRecuperacion = this.datosRecuperacion.sucursalesResumen || [];
        }
        
        if (datos.filtrosAplicados) {
            this.filtrosAplicados = datos.filtrosAplicados;
            this.fechaInicio = datos.filtrosAplicados.fechaInicio;
            this.fechaFin = datos.filtrosAplicados.fechaFin;
        }
    }

    async generarReporte(datos, opciones = {}) {
        try {
            const { mostrarAlerta = true } = opciones;
            this.configurarDatos(datos);

            if (mostrarAlerta) {
                Swal.fire({
                    title: 'Generando Reporte PDF Unificado...',
                    html: `<div style="margin-bottom:10px;"><i class="fas fa-chart-pie" style="font-size:32px; color:#c9a03d;"></i></div>
                        <p style="margin-top:12px;">Capturando gráficas...</p>`,
                    allowOutsideClick: false,
                    showConfirmButton: false,
                    didOpen: () => {
                        let progreso = 0;
                        const intervalo = setInterval(() => {
                            progreso += 2;
                            if (progreso <= 70) {
                                const barra = document.querySelector('.progress-bar');
                                if (barra) barra.style.width = progreso + '%';
                            }
                        }, 100);
                        window._intervaloProgreso = intervalo;
                    }
                });
            }

            await this.capturarTodasLasGraficas();
            await this.cargarLibrerias();
            await this.cargarLogoCentinela();
            await this.cargarLogoOrganizacion();

            if (mostrarAlerta && window._intervaloProgreso) {
                clearInterval(window._intervaloProgreso);
                const barra = document.querySelector('.progress-bar');
                if (barra) barra.style.width = '85%';
            }

            const pdf = new this.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            this.totalPaginas = 10;
            this.paginaActualReal = 1;

            await this._generarContenido(pdf);

            const fechaStr = this.formatearFechaArchivo();
            const nombreArchivo = `ESTADISTICAS_UNIFICADO_${this.organizacionActual?.nombre || 'organizacion'}_${fechaStr}.pdf`;

            if (mostrarAlerta) {
                if (window._intervaloProgreso) clearInterval(window._intervaloProgreso);
                Swal.close();
                await this.mostrarOpcionesDescarga(pdf, nombreArchivo);
            }

            return pdf;

        } catch (error) {
            console.error('Error generando reporte unificado:', error);
            if (window._intervaloProgreso) clearInterval(window._intervaloProgreso);
            if (mostrarAlerta) {
                Swal.close();
                Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo generar el reporte: ' + error.message });
            }
            throw error;
        }
    }

    async _generarContenido(pdf) {
        // PÁGINA 1 (SIN CAMBIOS)
        this.dibujarEncabezadoBase(pdf, 'REPORTE ESTADÍSTICO UNIFICADO', this.organizacionActual?.nombre || 'SISTEMA CENTINELA');
        let yPos = this.alturaEncabezado + 5;
        yPos = this._dibujarFiltrosCompactos(pdf, yPos);
        yPos += 5;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.titulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text('1. INCIDENCIAS - MÉTRICAS Y COLABORADORES', GRID_CONFIG.MARGEN_PAGINA, yPos);
        yPos += 6;
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 2, GRID_CONFIG.MARGEN_PAGINA + 100, yPos - 2);
        yPos += 6;
        if (this.metricasIncidencias) {
            yPos = this._dibujarMetricasIncidencias(pdf, this.metricasIncidencias, yPos);
        } else {
            yPos += 5;
        }
        yPos += 8;
        await this._dibujarGridColaboradores(pdf, yPos);
        yPos += 70;
        this.dibujarPiePagina(pdf);

        // PÁGINA 2 (SIN CAMBIOS)
        pdf.addPage();
        this.paginaActualReal++;
        this.dibujarEncabezadoBase(pdf, 'REPORTE ESTADÍSTICO UNIFICADO', 'CONTINUACIÓN - INCIDENCIAS');
        yPos = this.alturaEncabezado + 8;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.titulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text('2. INCIDENCIAS - ESTADO, RIESGO Y CATEGORÍAS', GRID_CONFIG.MARGEN_PAGINA, yPos);
        yPos += 6;
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 2, GRID_CONFIG.MARGEN_PAGINA + 100, yPos - 2);
        yPos += 8;
        await this._dibujarGridTresGraficas(pdf, yPos);
        yPos += 85;
        this.dibujarPiePagina(pdf);

        // PÁGINA 3 (SIN CAMBIOS)
        pdf.addPage();
        this.paginaActualReal++;
        this.dibujarEncabezadoBase(pdf, 'REPORTE ESTADÍSTICO UNIFICADO', 'CONTINUACIÓN - INCIDENCIAS');
        yPos = this.alturaEncabezado + 8;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.titulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text('3. INCIDENCIAS - SUCURSALES Y TIEMPO DE RESOLUCIÓN', GRID_CONFIG.MARGEN_PAGINA, yPos);
        yPos += 6;
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 2, GRID_CONFIG.MARGEN_PAGINA + 100, yPos - 2);
        yPos += 8;
        await this._dibujarGridDosGraficas(pdf, yPos);
        yPos += 85;
        this.dibujarPiePagina(pdf);

        // PÁGINA 4 (SIN CAMBIOS)
        pdf.addPage();
        this.paginaActualReal++;
        this.dibujarEncabezadoBase(pdf, 'REPORTE ESTADÍSTICO UNIFICADO', 'RECUPERACIÓN - KPIs Y GRÁFICAS');
        yPos = this.alturaEncabezado + 5;
        yPos = this._dibujarFiltrosCompactos(pdf, yPos);
        yPos += 5;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.titulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text('4. RECUPERACIÓN - MÉTRICAS Y DISTRIBUCIÓN', GRID_CONFIG.MARGEN_PAGINA, yPos);
        yPos += 6;
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 2, GRID_CONFIG.MARGEN_PAGINA + 100, yPos - 2);
        yPos += 6;
        if (this.estadisticasRecuperacion) {
            yPos = this._dibujarKPIsRecuperacion(pdf, this.estadisticasRecuperacion, yPos);
        } else {
            yPos += 5;
        }
        yPos += 10;
        await this._dibujarPrimerasGraficasRecuperacion(pdf, yPos);
        this.dibujarPiePagina(pdf);

        // PÁGINA 5 (SIN CAMBIOS)
        pdf.addPage();
        this.paginaActualReal++;
        this.dibujarEncabezadoBase(pdf, 'REPORTE ESTADÍSTICO UNIFICADO', 'RECUPERACIÓN - ANÁLISIS COMPARATIVO');
        yPos = this.alturaEncabezado + 8;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.titulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text('5. RECUPERACIÓN - TOP SUCURSALES Y COMPARATIVA', GRID_CONFIG.MARGEN_PAGINA, yPos);
        yPos += 6;
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 2, GRID_CONFIG.MARGEN_PAGINA + 100, yPos - 2);
        yPos += 8;
        await this._dibujarSegundasGraficasRecuperacion(pdf, yPos);
        yPos += 85;
        this.dibujarPiePagina(pdf);

        // =============================================
        // PÁGINA 6 - RESUMEN POR SUCURSAL (CORREGIDA)
        // =============================================
        pdf.addPage();
        this.paginaActualReal++;
        this.dibujarEncabezadoBase(pdf, 'REPORTE ESTADÍSTICO UNIFICADO', 'RECUPERACIÓN - RESUMEN POR SUCURSAL');
        yPos = this.alturaEncabezado + 8;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.titulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text('6. RESUMEN POR SUCURSAL', GRID_CONFIG.MARGEN_PAGINA, yPos);
        yPos += 6;
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 2, GRID_CONFIG.MARGEN_PAGINA + 70, yPos - 2);
        yPos += 8;
        
        if (this.sucursalesRecuperacion && this.sucursalesRecuperacion.length > 0) {
            yPos = this._dibujarTablaResumenSucursalesDirecta(pdf, this.sucursalesRecuperacion, yPos);
        } else {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.normal);
            pdf.setTextColor(100, 100, 100);
            pdf.text('No hay datos de sucursales para mostrar', GRID_CONFIG.MARGEN_PAGINA, yPos);
            yPos += 20;
        }
        
        this._dibujarAvisoPrivacidad(pdf);
        this.dibujarPiePagina(pdf);

        // =============================================
        // PÁGINA 7 - DESEMPEÑO (CORREGIDA)
        // =============================================
        pdf.addPage();
        this.paginaActualReal++;
        this.dibujarEncabezadoBase(pdf, 'REPORTE ESTADÍSTICO UNIFICADO', 'DESEMPEÑO');
        yPos = this.alturaEncabezado + 8;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.titulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text('7. DESEMPEÑO - COLABORADORES Y CATEGORÍAS', GRID_CONFIG.MARGEN_PAGINA, yPos);
        yPos += 6;
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 2, GRID_CONFIG.MARGEN_PAGINA + 100, yPos - 2);
        yPos += 8;
        
        // Tabla de colaboradores
        yPos = this._dibujarTablaColaboradoresDirecta(pdf, this.colaboradoresData, yPos);
        yPos += 15;
        
        // Tabla de categorías
        yPos = this._dibujarTablaCategoriasDirecta(pdf, this.categoriasData, yPos);
        
        this._dibujarAvisoPrivacidad(pdf);
        this.dibujarPiePagina(pdf);

        // PÁGINA 8 - MAPA DE CALORcapturarTodasLasGraficas
        pdf.addPage();
        this.paginaActualReal++;
        this.dibujarEncabezadoBase(pdf, 'REPORTE ESTADÍSTICO UNIFICADO', 'MAPA DE CALOR ESTADÍSTICO');
        yPos = this.alturaEncabezado + 8;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.titulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text('8. MAPA DE CALOR - DISTRIBUCIÓN GEOGRÁFICA', GRID_CONFIG.MARGEN_PAGINA, yPos);
        yPos += 6;
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 2, GRID_CONFIG.MARGEN_PAGINA + 100, yPos - 2);
        yPos += 10;
        await this._dibujarMapaCalor(pdf, yPos);
        this.dibujarPiePagina(pdf);

            // =============================================
        // PÁGINA 9 - TOP UBICACIONES CON MÁS INCIDENTES (SOLO GRÁFICA)
        // =============================================
        pdf.addPage();
        this.paginaActualReal++;
        this.dibujarEncabezadoBase(pdf, 'REPORTE ESTADÍSTICO UNIFICADO', 'ANÁLISIS POR UBICACIÓN - PARTE 1');
        yPos = this.alturaEncabezado + 8;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.titulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text('9. TOP UBICACIONES CON MÁS INCIDENTES', GRID_CONFIG.MARGEN_PAGINA, yPos);
        yPos += 6;
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 2, GRID_CONFIG.MARGEN_PAGINA + 100, yPos - 2);
        yPos += 10;
        
        // Gráfica más grande en la página 9 (aprovechando todo el espacio)
        await this._dibujarGraficoTopUbicacionesGrande(pdf, yPos);
        
        this._dibujarAvisoPrivacidad(pdf);
        this.dibujarPiePagina(pdf);

        // =============================================
        // PÁGINA 10 - DETALLE POR UBICACIÓN (TOP 10) - TABLA COMPLETA
        // =============================================
        pdf.addPage();
        this.paginaActualReal++;
        this.dibujarEncabezadoBase(pdf, 'REPORTE ESTADÍSTICO UNIFICADO', 'ANÁLISIS POR UBICACIÓN - PARTE 2');
        yPos = this.alturaEncabezado + 8;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.titulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text('10. INFORMACIÓN DETALLADA POR UBICACIÓN (TOP 10)', GRID_CONFIG.MARGEN_PAGINA, yPos);
        yPos += 6;
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 2, GRID_CONFIG.MARGEN_PAGINA + 90, yPos - 2);
        yPos += 8;
        
        // Tabla más grande y completa en la página 10
        await this._dibujarTablaMapaCalorGrande(pdf, yPos);
        
        this._dibujarAvisoPrivacidad(pdf);
        this.dibujarPiePagina(pdf);
    }

    // =============================================
    // TABLA DE COLABORADORES DIRECTA (CORREGIDA)
    // =============================================
    _dibujarTablaColaboradoresDirecta(pdf, colaboradores, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoTotal = anchoPagina - (margen * 2);

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.small);
        pdf.setTextColor(0, 0, 0);
        pdf.text('Desempeño de Colaboradores', margen, yPos);
        yPos += 6;
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(margen, yPos - 1, margen + 70, yPos - 1);
        yPos += 6;

        if (!colaboradores || colaboradores.length === 0) {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.normal);
            pdf.setTextColor(100, 100, 100);
            pdf.text('No hay datos de colaboradores para mostrar', margen, yPos);
            return yPos + 10;
        }

        const colAnchos = { nombre: 55, reportados: 22, actualizados: 22, seguimientos: 22, tiempo: 25, eficiencia: 30 };
        const xInicio = margen;
        const altoFila = 7;

        pdf.setFillColor(26, 59, 93);
        pdf.rect(xInicio, yPos - 3, anchoTotal, altoFila + 2, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(255, 255, 255);

        let currentX = xInicio;
        pdf.text('Colaborador', currentX + 2, yPos);
        currentX += colAnchos.nombre;
        pdf.text('Rep', currentX + 2, yPos);
        currentX += colAnchos.reportados;
        pdf.text('Act', currentX + 2, yPos);
        currentX += colAnchos.actualizados;
        pdf.text('Seg', currentX + 2, yPos);
        currentX += colAnchos.seguimientos;
        pdf.text('Tiempo', currentX + 2, yPos);
        currentX += colAnchos.tiempo;
        pdf.text('Efic.', currentX + 2, yPos);

        yPos += altoFila + 2;

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(0, 0, 0);

        const maxActividad = Math.max(...colaboradores.map(c => (c.reportados || 0) + (c.actualizados || 0) + (c.seguimientos || 0)), 1);

        for (let i = 0; i < Math.min(colaboradores.length, 10); i++) {
            const col = colaboradores[i];
            const tiempoPromedio = col.incidenciasResueltas > 0 ? Math.round(col.tiempoTotal / col.incidenciasResueltas) : 0;
            const totalActividad = (col.reportados || 0) + (col.actualizados || 0) + (col.seguimientos || 0);
            const eficiencia = Math.min(100, Math.round((totalActividad / maxActividad) * 100));

            if (i % 2 === 0) {
                pdf.setFillColor(248, 248, 252);
                pdf.rect(xInicio, yPos - 2.5, anchoTotal, altoFila + 1.5, 'F');
            }

            currentX = xInicio;
            
            let nombre = col.nombre || 'N/A';
            if (nombre.length > 20) nombre = nombre.substring(0, 18) + '..';
            pdf.text(nombre, currentX + 2, yPos);
            currentX += colAnchos.nombre;
            pdf.text((col.reportados || 0).toString(), currentX + 2, yPos);
            currentX += colAnchos.reportados;
            pdf.text((col.actualizados || 0).toString(), currentX + 2, yPos);
            currentX += colAnchos.actualizados;
            pdf.text((col.seguimientos || 0).toString(), currentX + 2, yPos);
            currentX += colAnchos.seguimientos;
            
            let tiempoColor = '#10b981';
            if (tiempoPromedio > 72) tiempoColor = '#ef4444';
            else if (tiempoPromedio > 24) tiempoColor = '#f97316';
            else if (tiempoPromedio > 0) tiempoColor = '#eab308';
            pdf.setTextColor(tiempoColor);
            pdf.text(`${tiempoPromedio}h`, currentX + 2, yPos);
            currentX += colAnchos.tiempo;
            
            pdf.setTextColor(0, 0, 0);
            const barraX = currentX + 2;
            const barraAncho = 20;
            pdf.setFillColor(220, 220, 220);
            pdf.rect(barraX, yPos - 4, barraAncho, 4, 'F');
            pdf.setFillColor(16, 185, 129);
            pdf.rect(barraX, yPos - 4, barraAncho * (eficiencia / 100), 4, 'F');
            pdf.setTextColor(0, 0, 0);
            pdf.text(`${eficiencia}%`, barraX + barraAncho + 3, yPos);

            yPos += altoFila + 1.5;
        }
        
        return yPos;
    }

    // =============================================
    // TABLA DE CATEGORÍAS DIRECTA
    // =============================================
    _dibujarTablaCategoriasDirecta(pdf, categorias, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoTotal = anchoPagina - (margen * 2);

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.small);
        pdf.setTextColor(0, 0, 0);
        pdf.text('Incidencias por Categoría', margen, yPos);
        yPos += 6;
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(margen, yPos - 1, margen + 70, yPos - 1);
        yPos += 6;

        if (!categorias || categorias.length === 0) {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.normal);
            pdf.setTextColor(100, 100, 100);
            pdf.text('No hay datos de categorías para mostrar', margen, yPos);
            return yPos + 10;
        }

        const colAnchos = { categoria: anchoTotal - 60, cantidad: 60 };
        const xInicio = margen;
        const altoFila = 7;

        pdf.setFillColor(26, 59, 93);
        pdf.rect(xInicio, yPos - 3, anchoTotal, altoFila + 2, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(255, 255, 255);
        pdf.text('Categoría', xInicio + 5, yPos);
        pdf.text('Cantidad', xInicio + colAnchos.categoria + 5, yPos);

        yPos += altoFila + 2;

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(0, 0, 0);

        for (let i = 0; i < Math.min(categorias.length, 15); i++) {
            const cat = categorias[i];
            
            if (i % 2 === 0) {
                pdf.setFillColor(248, 248, 252);
                pdf.rect(xInicio, yPos - 2.5, anchoTotal, altoFila + 1.5, 'F');
            }

            let nombre = cat.nombre || 'N/A';
            if (nombre.length > 45) nombre = nombre.substring(0, 43) + '...';
            pdf.text(nombre, xInicio + 5, yPos);
            pdf.text(cat.cantidad.toString(), xInicio + colAnchos.categoria + 5, yPos);

            yPos += altoFila + 1.5;
        }
        
        return yPos;
    }

    // =============================================
    // TABLA RESUMEN SUCURSALES DIRECTA (CORREGIDA)
    // =============================================
    _dibujarTablaResumenSucursalesDirecta(pdf, sucursales, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoTotal = anchoPagina - (margen * 2);
        const altoPagina = pdf.internal.pageSize.getHeight();

        if (!sucursales || sucursales.length === 0) return yPos;

        const colAnchos = { sucursal: 45, eventos: 18, perdido: 35, recuperado: 35, neto: 35, porcentaje: 25 };
        const xInicio = margen;
        const altoFila = 6.5;
        const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0 });

        pdf.setFillColor(26, 59, 93);
        pdf.rect(xInicio, yPos - 3, anchoTotal, altoFila + 2, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(255, 255, 255);

        let currentX = xInicio;
        pdf.text('Sucursal', currentX + 2, yPos);
        currentX += colAnchos.sucursal;
        pdf.text('Evt', currentX + 2, yPos);
        currentX += colAnchos.eventos;
        pdf.text('Perdido', currentX + 2, yPos);
        currentX += colAnchos.perdido;
        pdf.text('Recuperado', currentX + 2, yPos);
        currentX += colAnchos.recuperado;
        pdf.text('Neta', currentX + 2, yPos);
        currentX += colAnchos.neto;
        pdf.text('% Rec', currentX + 2, yPos);

        yPos += altoFila + 2;

        const espacioRestante = altoPagina - yPos - 35;
        const maxFilas = Math.min(Math.floor(espacioRestante / (altoFila + 1.5)), sucursales.length, 12);
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(0, 0, 0);

        for (let i = 0; i < maxFilas; i++) {
            const suc = sucursales[i];
            
            if (i % 2 === 0) {
                pdf.setFillColor(248, 248, 252);
                pdf.rect(xInicio, yPos - 2.5, anchoTotal, altoFila + 1.5, 'F');
            }

            currentX = xInicio;
            
            let nombre = suc.nombre || 'N/A';
            if (nombre.length > 22) nombre = nombre.substring(0, 20) + '..';
            pdf.text(nombre, currentX + 2, yPos);
            currentX += colAnchos.sucursal;
            pdf.text((suc.eventos || 0).toString(), currentX + 2, yPos);
            currentX += colAnchos.eventos;
            
            let perdidoStr;
            const perdido = suc.perdido || 0;
            if (perdido >= 1000000) perdidoStr = `$${(perdido / 1000000).toFixed(1)}M`;
            else if (perdido >= 1000) perdidoStr = `$${(perdido / 1000).toFixed(0)}K`;
            else perdidoStr = formatter.format(perdido);
            pdf.setTextColor(239, 68, 68);
            pdf.text(perdidoStr, currentX + 2, yPos);
            currentX += colAnchos.perdido;
            
            let recuperadoStr;
            const recuperado = suc.recuperado || 0;
            if (recuperado >= 1000000) recuperadoStr = `$${(recuperado / 1000000).toFixed(1)}M`;
            else if (recuperado >= 1000) recuperadoStr = `$${(recuperado / 1000).toFixed(0)}K`;
            else recuperadoStr = formatter.format(recuperado);
            pdf.setTextColor(16, 185, 129);
            pdf.text(recuperadoStr, currentX + 2, yPos);
            currentX += colAnchos.recuperado;
            
            const neto = perdido - recuperado;
            let netoStr;
            if (Math.abs(neto) >= 1000000) netoStr = `$${(neto / 1000000).toFixed(1)}M`;
            else if (Math.abs(neto) >= 1000) netoStr = `$${(neto / 1000).toFixed(0)}K`;
            else netoStr = formatter.format(neto);
            pdf.setTextColor(neto > 0 ? 239 : 16, neto > 0 ? 68 : 185, neto > 0 ? 68 : 129);
            pdf.text(netoStr, currentX + 2, yPos);
            currentX += colAnchos.neto;
            
            pdf.setTextColor(59, 130, 246);
            pdf.text(`${(suc.porcentaje || 0).toFixed(1)}%`, currentX + 2, yPos);

            yPos += altoFila + 1.5;
        }

        if (sucursales.length > maxFilas) {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.micro);
            pdf.setTextColor(100, 100, 100);
            pdf.text(`* Mostrando ${maxFilas} de ${sucursales.length} sucursales`, margen, yPos + 3);
            yPos += 8;
        }

        return yPos;
    }

    // =============================================
    // GRÁFICA TOP UBICACIONES MÁS PEQUEÑA
    // =============================================
    async _dibujarGraficoTopUbicacionesMediano(pdf, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoGrafica = anchoPagina - (margen * 2);
        const altoGrafica = 58;

        pdf.setFillColor(252, 252, 252);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(margen, yPos, anchoGrafica, altoGrafica, 3, 3, 'FD');

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.mini);
        pdf.setTextColor(0, 0, 0);
        pdf.text('Top ubicaciones con más incidentes', margen + 5, yPos + 6);

        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(margen + 5, yPos + 10, margen + anchoGrafica - 5, yPos + 10);

        const graficaX = margen + 3;
        const graficaY = yPos + 14;
        const graficaAncho = anchoGrafica - 6;
        const graficaAlto = altoGrafica - 18;

        pdf.setFillColor(255, 255, 255);
        pdf.rect(graficaX, graficaY, graficaAncho, graficaAlto, 'F');

        if (this.graficasCapturadas.graficoTopUbicaciones) {
            try {
                pdf.addImage(this.graficasCapturadas.graficoTopUbicaciones, 'PNG', graficaX + 1, graficaY + 1, graficaAncho - 2, graficaAlto - 2);
            } catch (error) {
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(this.fonts.mini);
                pdf.setTextColor(100, 100, 100);
                pdf.text('Error al cargar gráfica', graficaX + (graficaAncho / 2), graficaY + (graficaAlto / 2), { align: 'center' });
            }
        } else {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.mini);
            pdf.setTextColor(100, 100, 100);
            pdf.text('Sin datos de ubicaciones', graficaX + (graficaAncho / 2), graficaY + (graficaAlto / 2), { align: 'center' });
        }
    }
        // =============================================
    // GRÁFICA TOP UBICACIONES MÁS GRANDE (PÁGINA 9)
    // =============================================
    async _dibujarGraficoTopUbicacionesGrande(pdf, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const altoPagina = pdf.internal.pageSize.getHeight();
        const anchoGrafica = anchoPagina - (margen * 2);
        const altoGrafica = altoPagina - yPos - 35; // Usar casi toda la página

        pdf.setFillColor(252, 252, 252);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(margen, yPos, anchoGrafica, altoGrafica, 3, 3, 'FD');

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.normal);
        pdf.setTextColor(0, 0, 0);
        pdf.text('Top ubicaciones con más incidentes', margen + 5, yPos + 6);

        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(margen + 5, yPos + 10, margen + anchoGrafica - 5, yPos + 10);

        const graficaX = margen + 5;
        const graficaY = yPos + 16;
        const graficaAncho = anchoGrafica - 10;
        const graficaAlto = altoGrafica - 25;

        pdf.setFillColor(255, 255, 255);
        pdf.rect(graficaX, graficaY, graficaAncho, graficaAlto, 'F');

        if (this.graficasCapturadas.graficoTopUbicaciones) {
            try {
                pdf.addImage(this.graficasCapturadas.graficoTopUbicaciones, 'PNG', graficaX + 1, graficaY + 1, graficaAncho - 2, graficaAlto - 2);
            } catch (error) {
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(this.fonts.normal);
                pdf.setTextColor(100, 100, 100);
                pdf.text('Error al cargar gráfica', graficaX + (graficaAncho / 2), graficaY + (graficaAlto / 2), { align: 'center' });
            }
        } else {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.normal);
            pdf.setTextColor(100, 100, 100);
            pdf.text('Sin datos de ubicaciones', graficaX + (graficaAncho / 2), graficaY + (graficaAlto / 2), { align: 'center' });
        }
    }

    // =============================================
    // TABLA MAPA CALOR GRANDE (PÁGINA 10)
    // =============================================
      // =============================================
    // TABLA MAPA CALOR GRANDE (PÁGINA 10) - CORREGIDA
    // =============================================
    async _dibujarTablaMapaCalorGrande(pdf, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const altoPagina = pdf.internal.pageSize.getHeight();
        const anchoTabla = anchoPagina - (margen * 2);
        
        // Calcular espacio disponible
        const altoDisponible = altoPagina - yPos - 30;
        
        // Obtener datos de ubicaciones del mapa de calor
        let ubicacionesData = [];
        
        if (window.mapaCalorComponente && window.mapaCalorComponente.datosPorUbicacion) {
            // Convertir Map a array y ordenar por incidentes
            ubicacionesData = Array.from(window.mapaCalorComponente.datosPorUbicacion.values())
                .sort((a, b) => b.totalIncidentes - a.totalIncidentes)
                .slice(0, 10);
        } else if (this.datosMapaCalor && this.datosMapaCalor.datosPorUbicacion) {
            ubicacionesData = this.datosMapaCalor.datosPorUbicacion
                .sort((a, b) => b.totalIncidentes - a.totalIncidentes)
                .slice(0, 10);
        }
        
        // Si no hay datos, mostrar mensaje
        if (!ubicacionesData || ubicacionesData.length === 0) {
            pdf.setFillColor(252, 252, 252);
            pdf.setDrawColor(200, 200, 200);
            pdf.roundedRect(margen, yPos, anchoTabla, 60, 3, 3, 'FD');
            
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.normal);
            pdf.setTextColor(0, 0, 0);
            pdf.text('Información detallada por ubicación (Top 10)', margen + 5, yPos + 6);
            
            pdf.setDrawColor(201, 160, 61);
            pdf.setLineWidth(0.5);
            pdf.line(margen + 5, yPos + 10, margen + anchoTabla - 5, yPos + 10);
            
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.normal);
            pdf.setTextColor(100, 100, 100);
            pdf.text('No hay datos de ubicaciones para mostrar. Aplica filtros en el mapa de calor.', 
                margen + (anchoTabla / 2), yPos + 40, { align: 'center' });
            return;
        }
        
        // Configuración de la tabla
        const formatter = new Intl.NumberFormat('es-MX', { 
            style: 'currency', 
            currency: 'MXN', 
            minimumFractionDigits: 0,
            maximumFractionDigits: 0 
        });
        
        // Definir anchos de columnas (en mm)
        const colAnchos = {
            ubicacion: 65,
            incidentes: 22,
            perdido: 35,
            recuperado: 35,
            neto: 35,
            nivel: 28
        };
        
        const xInicio = margen + 3;
        const altoFila = 7;
        const headerY = yPos + 16;
        let currentY = headerY + altoFila;
        
        // Calcular cuántas filas caben
        const espacioFilas = altoDisponible - 40;
        const maxFilas = Math.min(Math.floor(espacioFilas / (altoFila + 1)), ubicacionesData.length, 10);
        
        // Dibujar fondo del contenedor
        const altoTotal = 40 + (maxFilas * (altoFila + 1.5)) + 10;
        pdf.setFillColor(252, 252, 252);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(margen, yPos, anchoTabla, Math.min(altoTotal, altoDisponible), 3, 3, 'FD');
        
        // Título
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.normal);
        pdf.setTextColor(0, 0, 0);
        pdf.text('Información detallada por ubicación (Top 10)', margen + 5, yPos + 6);
        
        // Línea decorativa
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(margen + 5, yPos + 10, margen + anchoTabla - 5, yPos + 10);
        
        // HEADER de la tabla
        pdf.setFillColor(26, 59, 93);
        pdf.rect(xInicio - 2, headerY - 4, anchoTabla - 2, altoFila + 2, 'F');
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(255, 255, 255);
        
        let currentX = xInicio;
        pdf.text('Ubicación', currentX, headerY);
        currentX += colAnchos.ubicacion;
        pdf.text('Inc', currentX, headerY);
        currentX += colAnchos.incidentes;
        pdf.text('Perdido', currentX, headerY);
        currentX += colAnchos.perdido;
        pdf.text('Recuperado', currentX, headerY);
        currentX += colAnchos.recuperado;
        pdf.text('Neta', currentX, headerY);
        currentX += colAnchos.neto;
        pdf.text('Nivel', currentX, headerY);
        
        // DATOS de la tabla
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(0, 0, 0);
        
        for (let i = 0; i < maxFilas; i++) {
            const ubic = ubicacionesData[i];
            
            // Fondo alternado
            if (i % 2 === 0) {
                pdf.setFillColor(248, 248, 252);
                pdf.rect(xInicio - 2, currentY - 3, anchoTabla - 2, altoFila + 2, 'F');
            }
            
            currentX = xInicio;
            
            // Nombre de ubicación (truncado)
            let nombre = ubic.nombre || 'N/A';
            if (nombre.length > 28) nombre = nombre.substring(0, 25) + '...';
            pdf.text(nombre, currentX, currentY);
            currentX += colAnchos.ubicacion;
            
            // Incidentes
            pdf.text((ubic.totalIncidentes || 0).toString(), currentX, currentY);
            currentX += colAnchos.incidentes;
            
            // Perdido
            const perdido = ubic.totalPerdido || 0;
            let perdidoStr = perdido >= 1000000 ? `$${(perdido / 1000000).toFixed(1)}M` :
                             perdido >= 1000 ? `$${(perdido / 1000).toFixed(0)}K` :
                             formatter.format(perdido);
            pdf.setTextColor(239, 68, 68);
            pdf.text(perdidoStr, currentX, currentY);
            currentX += colAnchos.perdido;
            
            // Recuperado
            const recuperado = ubic.totalRecuperado || 0;
            let recuperadoStr = recuperado >= 1000000 ? `$${(recuperado / 1000000).toFixed(1)}M` :
                               recuperado >= 1000 ? `$${(recuperado / 1000).toFixed(0)}K` :
                               formatter.format(recuperado);
            pdf.setTextColor(16, 185, 129);
            pdf.text(recuperadoStr, currentX, currentY);
            currentX += colAnchos.recuperado;
            
            // Neta (Perdido - Recuperado)
            const neto = perdido - recuperado;
            let netoStr = Math.abs(neto) >= 1000000 ? `$${(neto / 1000000).toFixed(1)}M` :
                         Math.abs(neto) >= 1000 ? `$${(neto / 1000).toFixed(0)}K` :
                         formatter.format(neto);
            pdf.setTextColor(neto > 0 ? 239 : 16, neto > 0 ? 68 : 185, neto > 0 ? 68 : 129);
            pdf.text(netoStr, currentX, currentY);
            currentX += colAnchos.neto;
            
            // Nivel de riesgo
            let nivelTexto = '';
            let nivelColor = '';
            switch (ubic.nivel) {
                case 'critico': nivelTexto = 'Crítico'; nivelColor = '#ef4444'; break;
                case 'alto': nivelTexto = 'Alto'; nivelColor = '#f97316'; break;
                case 'medio': nivelTexto = 'Medio'; nivelColor = '#eab308'; break;
                default: nivelTexto = 'Bajo'; nivelColor = '#10b981'; break;
            }
            pdf.setTextColor(nivelColor);
            pdf.text(nivelTexto, currentX, currentY);
            
            currentY += altoFila + 1.5;
        }
        
        // Mostrar cuántas filas se están mostrando
        if (ubicacionesData.length > maxFilas) {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.micro);
            pdf.setTextColor(100, 100, 100);
            pdf.text(`* Mostrando ${maxFilas} de ${ubicacionesData.length} ubicaciones`, 
                margen + 5, currentY + 3);
        }
    }

    // =============================================
    // TABLA MAPA CALOR
    // =============================================
    async _dibujarTablaMapaCalor(pdf, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoTabla = anchoPagina - (margen * 2);
        const altoPagina = pdf.internal.pageSize.getHeight();
        const espacioRestante = altoPagina - yPos - 25;

        pdf.setFillColor(252, 252, 252);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(margen, yPos, anchoTabla, Math.min(espacioRestante, 60), 3, 3, 'FD');

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.mini);
        pdf.setTextColor(0, 0, 0);
        pdf.text('Información detallada por ubicación', margen + 5, yPos + 6);

        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(margen + 5, yPos + 10, margen + anchoTabla - 5, yPos + 10);

        if (this.graficasCapturadas.tablaMapaCalor) {
            try {
                const tablaY = yPos + 14;
                const altoDisponible = Math.min(espacioRestante - 20, 50);
                pdf.addImage(this.graficasCapturadas.tablaMapaCalor, 'PNG', margen + 3, tablaY, anchoTabla - 6, altoDisponible);
            } catch (error) {
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(this.fonts.mini);
                pdf.setTextColor(100, 100, 100);
                pdf.text('No hay datos de tabla para mostrar', margen + (anchoTabla / 2), yPos + 30, { align: 'center' });
            }
        } else {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.mini);
            pdf.setTextColor(100, 100, 100);
            pdf.text('No hay datos de tabla para mostrar', margen + (anchoTabla / 2), yPos + 30, { align: 'center' });
        }
    }

    // =============================================
    // MAPA DE CALOR
    // =============================================
    async _dibujarMapaCalor(pdf, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const altoPagina = pdf.internal.pageSize.getHeight();
        const anchoMapa = anchoPagina - (margen * 2);
        const altoMapa = altoPagina - yPos - 20;

        pdf.setFillColor(252, 252, 252);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(margen, yPos, anchoMapa, altoMapa, 3, 3, 'FD');

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.normal);
        pdf.setTextColor(0, 0, 0);
        pdf.text('Distribución geográfica de incidentes por nivel de riesgo', margen + 5, yPos + 7);

        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(margen + 5, yPos + 11, margen + anchoMapa - 5, yPos + 11);

        const mapaX = margen + 3;
        const mapaY = yPos + 16;
        const mapaAncho = anchoMapa - 6;
        const mapaAlto = altoMapa - 24;

        pdf.setFillColor(0, 0, 0);
        pdf.rect(mapaX, mapaY, mapaAncho, mapaAlto, 'F');

        if (this.graficasCapturadas.mapaCalor) {
            try {
                pdf.addImage(this.graficasCapturadas.mapaCalor, 'PNG', mapaX + 1, mapaY + 1, mapaAncho - 2, mapaAlto - 2);
            } catch (error) {
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(this.fonts.mini);
                pdf.setTextColor(100, 100, 100);
                pdf.text('No se pudo cargar el mapa', mapaX + (mapaAncho / 2), mapaY + (mapaAlto / 2), { align: 'center' });
            }
        } else {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.mini);
            pdf.setTextColor(100, 100, 100);
            pdf.text('Sin datos de mapa de calor', mapaX + (mapaAncho / 2), mapaY + (mapaAlto / 2), { align: 'center' });
        }

        const leyendaY = yPos + altoMapa - 8;
        const coloresLeyenda = [
            { color: '#ef4444', nombre: 'Crítico' },
            { color: '#f97316', nombre: 'Alto' },
            { color: '#eab308', nombre: 'Medio' },
            { color: '#10b981', nombre: 'Bajo' }
        ];
        const anchoCuadro = 8;
        const espacioEntreItems = 28;
        const inicioXleyenda = margen + (anchoMapa / 2) - ((coloresLeyenda.length * espacioEntreItems) / 2);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.mini);
        pdf.setTextColor(200, 200, 200);
        for (let i = 0; i < coloresLeyenda.length; i++) {
            const item = coloresLeyenda[i];
            const itemX = inicioXleyenda + (i * espacioEntreItems);
            pdf.setFillColor(item.color);
            pdf.rect(itemX, leyendaY, anchoCuadro, anchoCuadro, 'F');
            pdf.text(item.nombre, itemX + anchoCuadro + 3, leyendaY + 5);
        }
    }

    // =============================================
    // MÉTODOS EXISTENTES (sin cambios de páginas 1-5)
    // =============================================
    async _dibujarGridTresGraficas(pdf, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoGrafica = (anchoPagina - (margen * 2) - 20) / 3;
        const espacioGraficas = 10;
        await this._dibujarGraficaCircularConTitulo(pdf, 'Estado de Incidencias', this.graficasCapturadas.estado, margen, yPos, anchoGrafica, 75);
        await this._dibujarGraficaCircularConTitulo(pdf, 'Niveles de Riesgo', this.graficasCapturadas.riesgo, margen + anchoGrafica + espacioGraficas, yPos, anchoGrafica, 75);
        await this._dibujarGraficaBarrasConTitulo(pdf, 'Incidencias por Categoría', this.graficasCapturadas.categorias, margen + (anchoGrafica + espacioGraficas) * 2, yPos, anchoGrafica, 75);
    }

    async _dibujarGridDosGraficas(pdf, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoGrafica = (anchoPagina - (margen * 2) - 20) / 2;
        const espacioGraficas = 20;
        await this._dibujarGraficaBarrasConTitulo(pdf, 'Incidencias por Sucursal', this.graficasCapturadas.sucursalesIncidencias, margen, yPos, anchoGrafica, 75);
        await this._dibujarGraficaTiempoEnGrid(pdf, 'Tiempo Promedio de Resolución por Colaborador', this.graficasCapturadas.tiempoResolucion, margen + anchoGrafica + espacioGraficas, yPos, anchoGrafica, 75);
    }

    async _dibujarGraficaTiempoEnGrid(pdf, titulo, imagenDataURL, x, y, ancho, alto) {
        const padding = 3;
        const alturaTitulo = 14;
        pdf.setFillColor(252, 252, 252);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(x, y, ancho, alto, 3, 3, 'FD');
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(x + 4, y + alturaTitulo - 2, x + ancho - 4, y + alturaTitulo - 2);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.mini);
        pdf.setTextColor(0, 0, 0);
        pdf.text(titulo, x + (ancho / 2), y + 5, { align: 'center' });
        const graficaX = x + padding;
        const graficaY = y + alturaTitulo + 2;
        const graficaAncho = ancho - (padding * 2);
        const graficaAlto = alto - alturaTitulo - 6;
        pdf.setFillColor(255, 255, 255);
        pdf.rect(graficaX, graficaY, graficaAncho, graficaAlto, 'F');
        if (imagenDataURL) {
            try {
                pdf.addImage(imagenDataURL, 'PNG', graficaX + 1, graficaY + 1, graficaAncho - 2, graficaAlto - 2);
            } catch (error) {
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(this.fonts.mini);
                pdf.setTextColor(100, 100, 100);
                pdf.text('Error al cargar gráfica', graficaX + (graficaAncho / 2), graficaY + (graficaAlto / 2), { align: 'center' });
            }
        } else {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.mini);
            pdf.setTextColor(100, 100, 100);
            pdf.text('Sin datos', graficaX + (graficaAncho / 2), graficaY + (graficaAlto / 2), { align: 'center' });
        }
    }

    async _dibujarPrimerasGraficasRecuperacion(pdf, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoContenedor = GRID_CONFIG.ANCHO_CONTENEDOR;
        const altoContenedorCircular = GRID_CONFIG.ALTO_CONTENEDOR_CIRCULAR;
        const altoContenedorNormal = GRID_CONFIG.ALTO_CONTENEDOR;
        const espaciadoH = GRID_CONFIG.ESPACIADO_HORIZONTAL;
        const anchoTotal = (anchoContenedor * 2) + espaciadoH;
        const inicioX = margen + ((pdf.internal.pageSize.getWidth() - (margen * 2) - anchoTotal) / 2);
        const col1X = inicioX;
        const col2X = inicioX + anchoContenedor + espaciadoH;
        const fila1Y = yPos;
        await this._dibujarGraficaCircularConLeyenda(pdf, 'Distribución por tipo de evento', this.graficasCapturadas.tipoEvento, col1X, fila1Y, anchoContenedor, altoContenedorCircular);
        await this._dibujarGraficaNormalConTitulo(pdf, 'Evolución mensual', this.graficasCapturadas.evolucionMensual, col2X, fila1Y, anchoContenedor, altoContenedorNormal);
    }

    async _dibujarSegundasGraficasRecuperacion(pdf, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoContenedor = GRID_CONFIG.ANCHO_CONTENEDOR;
        const altoContenedorNormal = GRID_CONFIG.ALTO_CONTENEDOR;
        const espaciadoH = GRID_CONFIG.ESPACIADO_HORIZONTAL;
        const anchoTotal = (anchoContenedor * 2) + espaciadoH;
        const inicioX = margen + ((pdf.internal.pageSize.getWidth() - (margen * 2) - anchoTotal) / 2);
        const col1X = inicioX;
        const col2X = inicioX + anchoContenedor + espaciadoH;
        const fila1Y = yPos;
        await this._dibujarGraficaNormalConTitulo(pdf, 'Top sucursales con más pérdidas', this.graficasCapturadas.topSucursalesRecuperacion, col1X, fila1Y, anchoContenedor, altoContenedorNormal);
        await this._dibujarGraficaNormalConTitulo(pdf, 'Pérdida vs Recuperación', this.graficasCapturadas.comparativa, col2X, fila1Y, anchoContenedor, altoContenedorNormal);
    }

    _dibujarFiltrosCompactos(pdf, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoContenido = pdf.internal.pageSize.getWidth() - (margen * 2);
        pdf.setFillColor(245, 245, 245);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(margen, yPos, anchoContenido, 10, 2, 2, 'FD');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(0, 0, 0);
        pdf.text('FILTROS:', margen + 5, yPos + 4);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(0, 0, 0);
        let filtroText = '';
        if (this.fechaInicio && this.fechaFin) {
            filtroText += `${this.formatearFechaVisualizacion(new Date(this.fechaInicio))} - ${this.formatearFechaVisualizacion(new Date(this.fechaFin))}`;
        } else {
            filtroText += 'Todo el historial';
        }
        filtroText += ' | ';
        if (this.filtrosAplicados.sucursalId && this.filtrosAplicados.sucursalId !== 'todas') {
            filtroText += `Sucursal: ${this.filtrosAplicados.sucursalId}`;
        } else {
            filtroText += 'Todas las sucursales';
        }
        filtroText += ' | ';
        if (this.filtrosAplicados.categoriaId && this.filtrosAplicados.categoriaId !== 'todas') {
            filtroText += `Categoría filtrada`;
        } else {
            filtroText += 'Todas las categorías';
        }
        if (this.filtrosAplicados.tipoEvento && this.filtrosAplicados.tipoEvento !== 'todos') {
            filtroText += ` | Tipo: ${this._capitalize(this.filtrosAplicados.tipoEvento)}`;
        }
        pdf.text(filtroText, margen + 45, yPos + 4);
        return yPos + 10;
    }

    _dibujarMetricasIncidencias(pdf, metricas, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoMetrica = (anchoPagina - (margen * 2) - 15) / 4;
        const espacioMetricas = 5;
        const metricasArray = [
            { titulo: 'CRÍTICAS', valor: metricas.criticas || 0, color: [239, 68, 68] },
            { titulo: 'ALTAS', valor: metricas.altas || 0, color: [249, 115, 22] },
            { titulo: 'PENDIENTES', valor: metricas.pendientes || 0, color: [245, 158, 11] },
            { titulo: 'TOTAL', valor: metricas.total || 0, color: [59, 130, 246] }
        ];
        for (let i = 0; i < metricasArray.length; i++) {
            const met = metricasArray[i];
            const xMetrica = margen + (i * (anchoMetrica + espacioMetricas));
            pdf.setFillColor(248, 248, 248);
            pdf.setDrawColor(220, 220, 220);
            pdf.roundedRect(xMetrica, yPos, anchoMetrica, GRID_CONFIG.ALTURA_METRICA, 2, 2, 'FD');
            pdf.setFillColor(met.color[0], met.color[1], met.color[2]);
            pdf.rect(xMetrica, yPos, anchoMetrica, 3, 'F');
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.mini);
            pdf.setTextColor(0, 0, 0);
            pdf.text(met.titulo, xMetrica + 4, yPos + 11);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(14);
            pdf.setTextColor(met.color[0], met.color[1], met.color[2]);
            pdf.text(met.valor.toString(), xMetrica + 4, yPos + 27);
        }
        return yPos + GRID_CONFIG.ALTURA_METRICA + 5;
    }

    _dibujarKPIsRecuperacion(pdf, estadisticas, yPos) {
        if (!estadisticas) return yPos;
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoKPI = (anchoPagina - (margen * 2) - 20) / 6;
        const espacioKPI = 4;
        const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0 });
        const kpis = [
            { titulo: 'Total Perdido', valor: estadisticas.totalPerdido || 0, color: [239, 68, 68] },
            { titulo: 'Total Recuperado', valor: estadisticas.totalRecuperado || 0, color: [16, 185, 129] },
            { titulo: 'Pérdida Neta', valor: estadisticas.totalNeto || 0, color: [245, 158, 11] },
            { titulo: 'Tasa Recuperación', valor: `${(estadisticas.porcentajeRecuperacion || 0).toFixed(2)}%`, color: [59, 130, 246] },
            { titulo: 'Total Eventos', valor: estadisticas.totalEventos || 0, color: [139, 92, 246] },
            { titulo: 'Promedio x Evento', valor: estadisticas.promedioPerdida || 0, color: [236, 72, 153] }
        ];
        for (let i = 0; i < kpis.length; i++) {
            const kpi = kpis[i];
            const xKPI = margen + (i * (anchoKPI + espacioKPI));
            pdf.setFillColor(248, 248, 248);
            pdf.setDrawColor(220, 220, 220);
            pdf.roundedRect(xKPI, yPos, anchoKPI, GRID_CONFIG.ALTURA_KPI, 2, 2, 'FD');
            pdf.setFillColor(kpi.color[0], kpi.color[1], kpi.color[2]);
            pdf.rect(xKPI, yPos, anchoKPI, 3, 'F');
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.mini - 0.5);
            pdf.setTextColor(0, 0, 0);
            pdf.text(kpi.titulo, xKPI + 3, yPos + 10);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(10);
            pdf.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
            let valorTexto;
            if (typeof kpi.valor === 'number' && kpi.titulo !== 'Tasa Recuperación') {
                if (Math.abs(kpi.valor) >= 1000000) {
                    valorTexto = `$${(kpi.valor / 1000000).toFixed(1)}M`;
                } else if (Math.abs(kpi.valor) >= 1000) {
                    valorTexto = `$${(kpi.valor / 1000).toFixed(0)}K`;
                } else if (kpi.titulo === 'Promedio x Evento') {
                    valorTexto = formatter.format(kpi.valor);
                } else {
                    valorTexto = kpi.valor.toLocaleString('es-MX');
                }
            } else {
                valorTexto = kpi.valor;
            }
            pdf.text(valorTexto, xKPI + 3, yPos + 23);
        }
        return yPos + GRID_CONFIG.ALTURA_KPI + 5;
    }

    async _dibujarGridColaboradores(pdf, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoGrafica = (anchoPagina - (margen * 2) - 20) / 3;
        const espacioGraficas = 10;
        await this._dibujarGraficaSimpleConTitulo(pdf, 'Colaboradores que más actualizan', this.graficasCapturadas.actualizadores, margen, yPos, anchoGrafica, 63);
        await this._dibujarGraficaSimpleConTitulo(pdf, 'Colaboradores con más reportes', this.graficasCapturadas.reportadores, margen + anchoGrafica + espacioGraficas, yPos, anchoGrafica, 63);
        await this._dibujarGraficaSimpleConTitulo(pdf, 'Colaboradores con más seguimientos', this.graficasCapturadas.seguimientos, margen + (anchoGrafica + espacioGraficas) * 2, yPos, anchoGrafica, 63);
    }

   async _dibujarGraficaSimpleConTitulo(pdf, titulo, imagenDataURL, x, y, ancho, alto) {
    const padding = 3;
    const alturaTitulo = 14;
    
    pdf.setFillColor(252, 252, 252);
    pdf.setDrawColor(200, 200, 200);
    pdf.roundedRect(x, y, ancho, alto, 3, 3, 'FD');
    
    pdf.setDrawColor(201, 160, 61);
    pdf.setLineWidth(0.5);
    pdf.line(x + 4, y + alturaTitulo - 2, x + ancho - 4, y + alturaTitulo - 2);
    
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(this.fonts.mini);
    pdf.setTextColor(0, 0, 0); // Título en NEGRO
    pdf.text(titulo, x + (ancho / 2), y + 5, { align: 'center' });
    
    const graficaX = x + padding;
    const graficaY = y + alturaTitulo + 2;
    const graficaAncho = ancho - (padding * 2);
    const graficaAlto = alto - alturaTitulo - 6;
    
    pdf.setFillColor(255, 255, 255);
    pdf.rect(graficaX, graficaY, graficaAncho, graficaAlto, 'F');
    
    if (imagenDataURL) {
        try {
            // Aplicar filtro para hacer el texto de la imagen NEGRO
            const imagenModificada = await this._forzarTextoNegroEnImagen(imagenDataURL);
            pdf.addImage(imagenModificada, 'PNG', graficaX + 1, graficaY + 1, graficaAncho - 2, graficaAlto - 2);
        } catch (error) {
            console.error('Error al procesar imagen:', error);
            // Fallback: usar imagen original
            pdf.addImage(imagenDataURL, 'PNG', graficaX + 1, graficaY + 1, graficaAncho - 2, graficaAlto - 2);
        }
    } else {
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(this.fonts.mini);
        pdf.setTextColor(100, 100, 100);
        pdf.text('Sin datos', graficaX + (graficaAncho / 2), graficaY + (graficaAlto / 2), { align: 'center' });
    }
}
async _forzarTextoNegroEnImagen(dataURL) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            canvas.width = img.width;
            canvas.height = img.height;
            
            // Dibujar imagen original
            ctx.drawImage(img, 0, 0);
            
            // Obtener datos de píxeles
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            
            // Analizar y modificar colores (texto claro a NEGRO)
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const a = data[i + 3];
                
                // Detectar texto claro (blanco, gris claro, colores claros)
                const esTextoClaro = (r > 180 && g > 180 && b > 180) || // blanco
                                     (r > 150 && g > 150 && b > 150) || // gris claro
                                     (Math.abs(r - g) < 50 && Math.abs(g - b) < 50 && r > 120); // grisáceo
                
                // Detectar colores de fondo oscuro o barras (no modificar)
                const esBarraOscura = (r < 100 && g < 100 && b < 200) || // azul oscuro
                                      (r < 100 && g > 100 && b < 100) || // verde oscuro
                                      (r > 100 && g < 100 && b < 100);   // rojo oscuro
                
                // Convertir texto claro a NEGRO (pero no modificar barras)
                if (esTextoClaro && !esBarraOscura && a > 200) {
                    data[i] = 0;     // R = 0
                    data[i + 1] = 0; // G = 0
                    data[i + 2] = 0; // B = 0
                }
            }
            
            ctx.putImageData(imageData, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.src = dataURL;
    });
}

    async _dibujarGraficaCircularConTitulo(pdf, titulo, imagenDataURL, x, y, ancho, alto) {
        const padding = 5;
        const alturaTitulo = 14;
        pdf.setFillColor(252, 252, 252);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(x, y, ancho, alto, 3, 3, 'FD');
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(x + 4, y + alturaTitulo - 2, x + ancho - 4, y + alturaTitulo - 2);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.mini);
        pdf.setTextColor(0, 0, 0);
        pdf.text(titulo, x + (ancho / 2), y + 5, { align: 'center' });
        const graficaLado = Math.min(ancho - (padding * 2), alto - alturaTitulo - 15);
        const graficaX = x + (ancho - graficaLado) / 2;
        const graficaY = y + alturaTitulo + 5;
        pdf.setFillColor(255, 255, 255);
        pdf.rect(graficaX, graficaY, graficaLado, graficaLado, 'F');
        if (imagenDataURL) {
            try {
                pdf.addImage(imagenDataURL, 'PNG', graficaX + 1, graficaY + 1, graficaLado - 2, graficaLado - 2);
            } catch (error) {
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(this.fonts.mini);
                pdf.setTextColor(100, 100, 100);
                pdf.text('Error', graficaX + (graficaLado / 2), graficaY + (graficaLado / 2), { align: 'center' });
            }
        } else {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.mini);
            pdf.setTextColor(100, 100, 100);
            pdf.text('Sin datos', graficaX + (graficaLado / 2), graficaY + (graficaLado / 2), { align: 'center' });
        }
    }

    async _dibujarGraficaCircularConLeyenda(pdf, titulo, imagenDataURL, x, y, ancho, alto) {
        const padding = 5;
        const alturaTitulo = 14;
        const alturaLeyenda = 12;
        pdf.setFillColor(252, 252, 252);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(x, y, ancho, alto, 3, 3, 'FD');
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(x + 4, y + alturaTitulo - 2, x + ancho - 4, y + alturaTitulo - 2);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.mini);
        pdf.setTextColor(0, 0, 0);
        pdf.text(titulo, x + (ancho / 2), y + 5, { align: 'center' });
        const graficaLado = Math.min(ancho - (padding * 2), alto - alturaTitulo - alturaLeyenda - 10);
        const graficaX = x + (ancho - graficaLado) / 2;
        const graficaY = y + alturaTitulo + 5;
        pdf.setFillColor(255, 255, 255);
        pdf.rect(graficaX, graficaY, graficaLado, graficaLado, 'F');
        if (imagenDataURL) {
            try {
                pdf.addImage(imagenDataURL, 'PNG', graficaX + 1, graficaY + 1, graficaLado - 2, graficaLado - 2);
            } catch (error) {
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(this.fonts.mini);
                pdf.setTextColor(100, 100, 100);
                pdf.text('Error', graficaX + (graficaLado / 2), graficaY + (graficaLado / 2), { align: 'center' });
            }
        } else {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.mini);
            pdf.setTextColor(100, 100, 100);
            pdf.text('Sin datos', graficaX + (graficaLado / 2), graficaY + (graficaLado / 2), { align: 'center' });
        }
        const leyendaY = graficaY + graficaLado + 3;
        const coloresLeyenda = [
            { color: '#ef4444', nombre: 'Robo' },
            { color: '#f59e0b', nombre: 'Extravío' },
            { color: '#3b82f6', nombre: 'Accidente' },
            { color: '#8b5cf6', nombre: 'Otro' }
        ];
        const anchoCuadro = 5;
        const espacioEntreItems = 18;
        const inicioXleyenda = x + (ancho / 2) - ((coloresLeyenda.length * espacioEntreItems) / 2);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.mini - 0.5);
        pdf.setTextColor(0, 0, 0);
        for (let i = 0; i < coloresLeyenda.length; i++) {
            const item = coloresLeyenda[i];
            const itemX = inicioXleyenda + (i * espacioEntreItems);
            pdf.setFillColor(item.color);
            pdf.rect(itemX, leyendaY, anchoCuadro, anchoCuadro, 'F');
            pdf.text(item.nombre, itemX + anchoCuadro + 2, leyendaY + 4);
        }
    }

    async _dibujarGraficaNormalConTitulo(pdf, titulo, imagenDataURL, x, y, ancho, alto) {
        const padding = 3;
        const alturaTitulo = 14;
        pdf.setFillColor(252, 252, 252);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(x, y, ancho, alto, 3, 3, 'FD');
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(x + 4, y + alturaTitulo - 2, x + ancho - 4, y + alturaTitulo - 2);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.mini);
        pdf.setTextColor(0, 0, 0);
        pdf.text(titulo, x + (ancho / 2), y + 5, { align: 'center' });
        const graficaX = x + padding;
        const graficaY = y + alturaTitulo + 2;
        const graficaAncho = ancho - (padding * 2);
        const graficaAlto = alto - alturaTitulo - 6;
        pdf.setFillColor(255, 255, 255);
        pdf.rect(graficaX, graficaY, graficaAncho, graficaAlto, 'F');
        if (imagenDataURL) {
            try {
                pdf.addImage(imagenDataURL, 'PNG', graficaX + 1, graficaY + 1, graficaAncho - 2, graficaAlto - 2);
            } catch (error) {
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(this.fonts.mini);
                pdf.setTextColor(100, 100, 100);
                pdf.text('Error al cargar gráfica', graficaX + (graficaAncho / 2), graficaY + (graficaAlto / 2), { align: 'center' });
            }
        } else {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.mini);
            pdf.setTextColor(100, 100, 100);
            pdf.text('Sin datos', graficaX + (graficaAncho / 2), graficaY + (graficaAlto / 2), { align: 'center' });
        }
    }

    async _dibujarGraficaBarrasConTitulo(pdf, titulo, imagenDataURL, x, y, ancho, alto) {
        const padding = 3;
        const alturaTitulo = 14;
        pdf.setFillColor(252, 252, 252);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(x, y, ancho, alto, 3, 3, 'FD');
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(x + 4, y + alturaTitulo - 2, x + ancho - 4, y + alturaTitulo - 2);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.mini);
        pdf.setTextColor(0, 0, 0);
        pdf.text(titulo, x + (ancho / 2), y + 5, { align: 'center' });
        const graficaX = x + padding;
        const graficaY = y + alturaTitulo + 2;
        const graficaAncho = ancho - (padding * 2);
        const graficaAlto = alto - alturaTitulo - 6;
        pdf.setFillColor(255, 255, 255);
        pdf.rect(graficaX, graficaY, graficaAncho, graficaAlto, 'F');
        if (imagenDataURL) {
            try {
                pdf.addImage(imagenDataURL, 'PNG', graficaX + 1, graficaY + 1, graficaAncho - 2, graficaAlto - 2);
            } catch (error) {
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(this.fonts.mini);
                pdf.setTextColor(100, 100, 100);
                pdf.text('Error al cargar gráfica', graficaX + (graficaAncho / 2), graficaY + (graficaAlto / 2), { align: 'center' });
            }
        } else {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.mini);
            pdf.setTextColor(100, 100, 100);
            pdf.text('Sin datos', graficaX + (graficaAncho / 2), graficaY + (graficaAlto / 2), { align: 'center' });
        }
    }

    _capitalize(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }

    dibujarEncabezadoBase(pdf, titulo, subtitulo) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const alturaEncabezado = 38;
        pdf.saveGraphicsState();
        pdf.setFillColor(255, 255, 255);
        pdf.rect(0, 0, anchoPagina, alturaEncabezado, 'F');
        pdf.setDrawColor(coloresBase.primario);
        pdf.setFillColor(coloresBase.primario);
        pdf.rect(0, 0, anchoPagina, 2, 'F');
        const dimensiones = this.dimensionesLogo;
        const yLogo = 18;
        const xLogoDerecha = anchoPagina - margen - (dimensiones.diametro * 2) - dimensiones.separacion;
        const xCentinela = xLogoDerecha;
        const xOrganizacion = xCentinela + dimensiones.diametro + dimensiones.separacion;
        this._dibujarLogos(pdf, xCentinela, xOrganizacion, yLogo, dimensiones.diametro / 2);
        pdf.setTextColor(coloresBase.primario);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.tituloPrincipal);
        pdf.text(titulo, anchoPagina / 2, 14, { align: 'center' });
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.small);
        pdf.setTextColor(0, 0, 0);
        pdf.text(subtitulo, anchoPagina / 2, 21, { align: 'center' });
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(0, 0, 0);
        pdf.text(`Generado: ${this.formatearFecha(new Date())}`, margen, 30);
        pdf.setDrawColor(coloresBase.secundario);
        pdf.setLineWidth(0.5);
        pdf.line(margen, alturaEncabezado - 2, anchoPagina - margen, alturaEncabezado - 2);
        pdf.restoreGraphicsState();
    }

    dibujarPiePagina(pdf) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const altoPagina = pdf.internal.pageSize.getHeight();
        const alturaPie = 8;
        pdf.saveGraphicsState();
        pdf.setDrawColor(coloresBase.secundario);
        pdf.setLineWidth(0.3);
        pdf.line(margen, altoPagina - alturaPie - 2, anchoPagina - margen, altoPagina - alturaPie - 2);
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(0, 0, 0);
        pdf.text('Sistema Centinela - Reporte Estadístico Unificado', margen, altoPagina - 4);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(0, 0, 0);
        pdf.text(`Página ${this.paginaActualReal} de ${this.totalPaginas}`, anchoPagina - margen, altoPagina - 4, { align: 'right' });
        pdf.setDrawColor(coloresBase.primario);
        pdf.setFillColor(coloresBase.primario);
        pdf.rect(0, altoPagina - 1.5, anchoPagina, 1.5, 'F');
        pdf.restoreGraphicsState();
    }

    _dibujarAvisoPrivacidad(pdf) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoContenido = pdf.internal.pageSize.getWidth() - (margen * 2);
        const altoPagina = pdf.internal.pageSize.getHeight();
        const alturaAviso = 30;
        pdf.saveGraphicsState();
        pdf.setFillColor(248, 248, 248);
        pdf.rect(margen, altoPagina - alturaAviso - 8, anchoContenido, alturaAviso, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.mini);
        pdf.setTextColor(80, 80, 80);
        pdf.text("AVISO DE PRIVACIDAD", margen + 6, altoPagina - alturaAviso - 2);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.mini - 0.5);
        pdf.setTextColor(100, 100, 100);
        const aviso = "La información contenida en este documento es responsabilidad exclusiva de quien utiliza el Sistema Centinela. Este reporte tiene carácter informativo y no constituye un documento legal oficial. Los datos aquí presentados son confidenciales y de uso interno.";
        const lineasAviso = this.dividirTextoEnLineas(pdf, aviso, anchoContenido - 20);
        let yAviso = altoPagina - alturaAviso + 6;
        for (let i = 0; i < Math.min(lineasAviso.length, 2); i++) {
            pdf.text(lineasAviso[i], margen + 6, yAviso + (i * 4.5));
        }
        pdf.restoreGraphicsState();
    }
}

export const generadorPDFEstadisticasUnificado = new PDFEstadisticasUnificadoGenerator();
export default generadorPDFEstadisticasUnificado;