class FooterComponent {
    constructor() {
        this.init();
    }

    // Inicializa el componente evitando duplicados
    init() {
        if (window.FooterComponentLoaded) return;
        window.FooterComponentLoaded = true;

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    // Configuración principal del footer
    setup() {
        try {
            this.removeOriginalFooter();
            this.createFooter();
            this.updateDateTime();
        } catch (error) {
            console.error('❌ Error:', error);
        }
    }

    // Remueve cualquier footer existente
    removeOriginalFooter() {
        const originalFooter = document.querySelector('footer');
        originalFooter?.remove();
    }

    // Crea el footer completo
    createFooter() {
        this.addStyles();
        this.insertHTML();
    }

    // Agrega estilos CSS para el footer (SOLO PARA EL FOOTER, SIN AFECTAR GLOBALES)
    addStyles() {
        if (document.getElementById('footer-component-styles')) return;

        const styles = `
            /* ============================================
               FOOTER COMPONENT - ESTILOS AISLADOS
               ============================================ */
            
            /* Footer fijo en la parte inferior */
            .footer-component {
                position: fixed;
                bottom: 0;
                left: 0;
                width: 100%;
                background-color: var(--color-bg-primary, #0a0a0a);
                color: var(--navbar-text, #ffffff);
                font-family: var(--font-family-primary, 'Orbitron', sans-serif);
                padding: 8px 0;
                font-size: 14px;
                box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.5);
                z-index: 900;
                border-top: 1px solid var(--color-border-light, rgba(255,255,255,0.1));
            }
            
            /* Efecto al hacer scroll */
            .footer-component.scrolled {
                background-color: var(--navbar-scrolled-bg, #0a0a0a);
                box-shadow: var(--navbar-scrolled-shadow, 0 -2px 15px rgba(0,0,0,0.3));
            }
            
            /* Contenedor principal centrado */
            .footer-bottom-container {
                width: 100%;
                max-width: 1400px;
                margin: 0 auto;
                padding: 0 20px;
                box-sizing: border-box;
            }
            
            /* Layout principal: Logo | Copyright | Fecha/Hora */
            .footer-bottom-content {
                display: flex;
                justify-content: space-between;
                align-items: center;
                width: 100%;
                min-height: 40px;
                gap: 15px;
            }
            
            /* Sección izquierda - Logo */
            .footer-left {
                display: flex;
                align-items: center;
                gap: 8px;
                flex: 1;
                justify-content: flex-start;
                min-width: 0;
            }
            
            /* Enlace del logo */
            .footer-logo-link {
                display: flex;
                align-items: center;
                gap: 6px;
                text-decoration: none;
                transition: all 0.3s ease;
            }
            
            /* Logo imagen */
            .footer-logo {
                height: 24px;
                width: auto;
                object-fit: contain;
                flex-shrink: 0;
            }
            
            /* Texto del logo */
            .footer-logo-text {
                color: var(--navbar-logo-text, #ffffff);
                font-weight: 500;
                font-size: 13px;
                white-space: nowrap;
            }
            
            /* Sección central - Copyright */
            .footer-center {
                flex: 2;
                text-align: center;
                padding: 0 10px;
                min-width: 0;
            }
            
            .copyright {
                color: var(--navbar-text, #cccccc);
                margin: 0;
                font-size: 12px;
                white-space: nowrap;
            }
            
            /* Sección derecha - Fecha y Hora */
            .footer-right {
                display: flex;
                align-items: center;
                flex: 1;
                justify-content: flex-end;
                min-width: 0;
            }
            
            /* Contenedor para fecha y hora apilados */
            .datetime-container {
                display: flex;
                flex-direction: column;
                align-items: flex-end;
                gap: 2px;
                text-align: right;
            }
            
            /* Estilos para fecha y hora */
            .date-display, .time-display {
                white-space: nowrap;
                color: var(--navbar-text, #cccccc);
                font-size: 12px;
                line-height: 1.3;
            }
            
            /* Hora con estilo de reloj digital */
            .time-display {
                font-weight: 600;
                font-family: 'Courier New', monospace;
                font-size: 13px;
            }
            
            /* ============================================
               RESPONSIVE - SIN AFECTAR OTROS ELEMENTOS
               ============================================ */
            
            /* Tablet */
            @media (max-width: 768px) {
                .footer-component {
                    padding: 6px 0;
                }
                
                .footer-bottom-container {
                    padding: 0 15px;
                }
                
                .footer-bottom-content {
                    flex-wrap: wrap;
                    gap: 8px;
                    min-height: auto;
                }
                
                /* Logo a la izquierda */
                .footer-left {
                    order: 1;
                    flex: 1;
                    min-width: auto;
                }
                
                /* Fecha/Hora a la derecha */
                .footer-right {
                    order: 2;
                    flex: 1;
                }
                
                /* Copyright abajo, centrado */
                .footer-center {
                    order: 3;
                    flex: 0 0 100%;
                    width: 100%;
                    text-align: center;
                    padding: 4px 0 0;
                }
                
                .copyright {
                    white-space: normal;
                    font-size: 10px;
                    line-height: 1.4;
                }
                
                .footer-logo {
                    height: 20px;
                }
                
                .footer-logo-text {
                    font-size: 11px;
                }
                
                .date-display, .time-display {
                    font-size: 10px;
                }
                
                .time-display {
                    font-size: 11px;
                }
            }
            
            /* Móvil */
            @media (max-width: 480px) {
                .footer-component {
                    padding: 5px 0;
                }
                
                .footer-bottom-container {
                    padding: 0 12px;
                }
                
                .footer-bottom-content {
                    gap: 6px;
                }
                
                .footer-left {
                    flex: 1;
                }
                
                .footer-right {
                    flex: 1;
                }
                
                .footer-center {
                    margin-top: 2px;
                }
                
                .footer-logo {
                    height: 18px;
                }
                
                .footer-logo-text {
                    font-size: 10px;
                }
                
                .copyright {
                    font-size: 9px;
                }
                
                .date-display {
                    font-size: 9px;
                }
                
                .time-display {
                    font-size: 10px;
                }
            }
            
            /* Móvil muy pequeño */
            @media (max-width: 360px) {
                .footer-component {
                    padding: 4px 0;
                }
                
                .footer-bottom-container {
                    padding: 0 10px;
                }
                
                /* Ocultar texto del logo en pantallas muy pequeñas */
                .footer-logo-text {
                    display: none;
                }
                
                .footer-logo {
                    height: 16px;
                }
                
                .copyright {
                    font-size: 8px;
                }
                
                .date-display {
                    font-size: 8px;
                }
                
                .time-display {
                    font-size: 9px;
                }
                
                .datetime-container {
                    gap: 1px;
                }
            }
            
            /* Asegurar que el contenido no quede oculto detrás del footer */
            body {
                padding-bottom: 55px !important;
                margin-bottom: 0 !important;
            }
            
            /* Ajuste para pantallas pequeñas */
            @media (max-width: 768px) {
                body {
                    padding-bottom: 65px !important;
                }
            }
            
            @media (max-width: 480px) {
                body {
                    padding-bottom: 70px !important;
                }
            }
        `;

        const styleElement = document.createElement('style');
        styleElement.id = 'footer-component-styles';
        styleElement.textContent = styles;
        document.head.appendChild(styleElement);
    }

    // Inserta la estructura HTML del footer
    insertHTML() {
        const footer = document.createElement('footer');
        footer.className = 'footer-component';
        footer.innerHTML = `
            <div class="footer-bottom-container">
                <div class="footer-bottom-content">
                    <!-- Logo y nombre de la empresa -->
                    <div class="footer-left">
                        <a href="https://rsienterprise.web.app/" target="_blank" rel="noopener noreferrer" class="footer-logo-link">
                            <img src="/assets/images/logoApp.png" alt="Centinela Logo" class="footer-logo" onerror="this.style.display='none'">
                            <span class="footer-logo-text">RSI Enterprise</span>
                        </a>
                    </div>
                    
                    <!-- Información de copyright -->
                    <div class="footer-center">
                        <p class="copyright">
                            © ${new Date().getFullYear()} RSI Enterprise. Todos los derechos reservados.
                        </p>
                    </div>
                    
                    <!-- Fecha y hora en tiempo real -->
                    <div class="footer-right">
                        <div class="datetime-container">
                            <div id="currentDate" class="date-display"></div>
                            <div id="currentTime" class="time-display"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(footer);
        this.setupScrollEffect();
    }

    // Configura efecto visual al hacer scroll
    setupScrollEffect() {
        const footer = document.querySelector('.footer-component');
        if (!footer) return;

        window.addEventListener('scroll', () => {
            footer.classList.toggle('scrolled', window.scrollY > 50);
        });
    }

    // Formatea la fecha completa
    formatDate(date) {
        const options = {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            timeZone: 'America/Mexico_City'
        };
        return date.toLocaleDateString('es-MX', options);
    }

    // Formatea fecha muy corta
    formatShortDate(date) {
        const options = {
            day: 'numeric',
            month: 'short',
            year: '2-digit',
            timeZone: 'America/Mexico_City'
        };
        return date.toLocaleDateString('es-MX', options);
    }

    // Formatea fecha extremadamente corta
    formatVeryShortDate(date) {
        const options = {
            day: 'numeric',
            month: 'numeric',
            timeZone: 'America/Mexico_City'
        };
        return date.toLocaleDateString('es-MX', options);
    }

    // Formatea hora completa con segundos
    formatTime(date) {
        const options = {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
            timeZone: 'America/Mexico_City'
        };
        return date.toLocaleTimeString('es-MX', options);
    }

    // Formatea hora sin segundos
    formatShortTime(date) {
        const options = {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
            timeZone: 'America/Mexico_City'
        };
        return date.toLocaleTimeString('es-MX', options);
    }

    // Actualiza fecha y hora en tiempo real
    updateDateTime() {
        const dateElement = document.getElementById('currentDate');
        const timeElement = document.getElementById('currentTime');

        if (!dateElement || !timeElement) return;

        const update = () => {
            const now = new Date();
            const width = window.innerWidth;

            // Formato responsive según tamaño de pantalla
            if (width <= 360) {
                // Móvil muy pequeño: formato ultra compacto
                dateElement.textContent = this.formatVeryShortDate(now);
                timeElement.textContent = this.formatShortTime(now);
            } else if (width <= 480) {
                // Móvil: fecha corta, hora sin segundos
                dateElement.textContent = this.formatShortDate(now);
                timeElement.textContent = this.formatShortTime(now);
            } else if (width <= 768) {
                // Tablet: fecha normal, hora sin segundos
                dateElement.textContent = this.formatDate(now);
                timeElement.textContent = this.formatShortTime(now);
            } else {
                // Desktop: formato completo
                dateElement.textContent = this.formatDate(now);
                timeElement.textContent = this.formatTime(now);
            }
        };

        update();
        setInterval(update, 1000);
        window.addEventListener('resize', update);
    }
}

// Inicializa automáticamente al cargar
new FooterComponent();