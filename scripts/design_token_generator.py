import sys
import json
import argparse
import colorsys

def hex_to_hsv(hex_color):
    hex_color = hex_color.lstrip('#')
    rgb = tuple(int(hex_color[i:i+2], 16) / 255.0 for i in (0, 2, 4))
    return colorsys.rgb_to_hsv(*rgb)

def hsv_to_hex(h, s, v):
    rgb = colorsys.hsv_to_rgb(h, s, v)
    return "#{:02x}{:02x}{:02x}".format(int(rgb[0]*255), int(rgb[1]*255), int(rgb[2]*255))

def generate_palette(base_color, style):
    try:
        h, s, v = hex_to_hsv(base_color)
    except Exception:
        h, s, v = hex_to_hsv("#0b1d3a") # Default fallback if invalid input
    
    # Simple palette generation logic based on style
    palette = {
        'navy': base_color,
        'navy-deep': hsv_to_hex(h, min(s*1.2, 1.0), max(v*0.7, 0.05)),
        'navy-medium': hsv_to_hex(h, s*0.9, min(v*1.3, 1.0)),
        'navy-light': hsv_to_hex(h, s*0.8, min(v*1.8, 1.0)),
    }
    
    if style == 'modern':
        palette.update({
            'gold': '#c8a84c',
            'gold-dark': '#a68a3a',
            'gold-light': '#e8d48b',
            'gold-hover': '#b8982f',
            'gold-text': '#8b7029',
        })
    elif style == 'classic':
        palette.update({
            'gold': '#d4af37',
            'gold-dark': '#aa8c2c',
            'gold-light': '#ebd580',
            'gold-hover': '#c29e2e',
            'gold-text': '#8a7122',
        })
    else: # playful
        palette.update({
            'gold': '#ffd700',
            'gold-dark': '#ccac00',
            'gold-light': '#ffe866',
            'gold-hover': '#e6c200',
            'gold-text': '#b39700',
        })
        
    palette.update({
        'white': '#ffffff',
        'gray-50': '#f8fafc',
        'gray-100': '#f1f5f9',
        'gray-200': '#e2e8f0',
        'gray-300': '#cbd5e1',
        'gray-400': '#94a3b8',
        'gray-500': '#64748b',
        'gray-600': '#475569',
        'gray-700': '#334155',
        'gray-800': '#1e293b',
        'gray-900': '#0f172a',
        'red-danger': '#dc2626',
        'red-bg': '#fef2f2',
        'red-border': '#fecaca',
        'green-safe': '#16a34a',
        'green-bg': '#f0fdf4',
        'green-border': '#bbf7d0',
    })
    
    return palette

def generate_tokens(base_color, style):
    colors = generate_palette(base_color, style)
    
    typography = {
        'font-display': "'Instrument Serif', Georgia, 'Times New Roman', serif",
        'font-body': "'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif",
        'text-xs': '0.75rem',  # 12px
        'text-sm': '0.875rem', # 14px
        'text-base': '1rem',   # 16px
        'text-lg': '1.125rem',  # 18px
        'text-xl': '1.25rem',  # 20px
        'text-2xl': '1.5rem',  # 24px
        'text-3xl': '1.875rem', # 30px
        'text-4xl': '2.25rem', # 36px
        'text-5xl': '3rem',    # 48px
        'text-6xl': '3.75rem', # 60px
        'text-7xl': '4.5rem',  # 72px
        'leading-tight': '1.15',
        'leading-snug': '1.3',
        'leading-normal': '1.6',
        'leading-relaxed': '1.75',
        'tracking-tight': '-0.02em',
        'tracking-normal': '0',
        'tracking-wide': '0.025em',
        'tracking-wider': '0.05em',
        'tracking-widest': '0.1em',
    }
    
    spacing = {
        'space-1': '0.25rem',  # 4px
        'space-2': '0.5rem',   # 8px
        'space-3': '0.75rem',  # 12px
        'space-4': '1rem',     # 16px
        'space-5': '1.25rem',  # 20px
        'space-6': '1.5rem',   # 24px
        'space-8': '2rem',     # 32px
        'space-10': '2.5rem',  # 40px
        'space-12': '3rem',    # 48px
        'space-16': '4rem',    # 64px
        'space-20': '5rem',    # 80px
        'space-24': '6rem',    # 96px
        'space-32': '8rem',    # 128px
    }
    
    layout = {
        'max-width': '1200px',
        'max-width-sm': '640px',
        'max-width-md': '768px',
        'max-width-lg': '1024px',
        'max-width-xl': '1280px',
        'nav-height': '116px',
    }
    
    borders = {
        'radius-sm': '4px',
        'radius-md': '8px',
        'radius-lg': '12px',
        'radius-xl': '16px',
        'radius-2xl': '24px',
        'radius-full': '9999px',
        'border-thin': '1px solid var(--gray-200)',
    }
    
    shadows = {
        'shadow-xs': '0 1px 2px rgba(0, 0, 0, 0.05)',
        'shadow-sm': '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)',
        'shadow-md': '0 4px 6px rgba(0, 0, 0, 0.06), 0 2px 4px rgba(0, 0, 0, 0.04)',
        'shadow-lg': '0 10px 25px rgba(0, 0, 0, 0.08), 0 4px 10px rgba(0, 0, 0, 0.04)',
        'shadow-xl': '0 20px 50px rgba(0, 0, 0, 0.1), 0 8px 20px rgba(0, 0, 0, 0.06)',
        'shadow-gold': f"0 4px 20px {colors['gold']}40",
        'shadow-card': '0 1px 3px rgba(0, 0, 0, 0.06), 0 8px 32px rgba(0, 0, 0, 0.04)',
        'shadow-card-hover': '0 4px 8px rgba(0, 0, 0, 0.08), 0 16px 48px rgba(0, 0, 0, 0.08)',
    }
    
    glass = {
        'glass-navy': f"rgba({int(colors['navy'][1:3], 16)}, {int(colors['navy'][3:5], 16)}, {int(colors['navy'][5:7], 16)}, 0.85)",
        'glass-white': 'rgba(255, 255, 255, 0.08)',
        'glass-blur': 'blur(20px)',
        'glass-border': 'rgba(255, 255, 255, 0.12)',
    }

    transitions = {
        'ease-out': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'ease-in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'duration-fast': '150ms',
        'duration-normal': '300ms',
        'duration-slow': '500ms',
        'duration-slower': '800ms',
    }

    z_index = {
        'z-base': '1',
        'z-dropdown': '100',
        'z-sticky': '200',
        'z-overlay': '300',
        'z-modal': '400',
        'z-toast': '500',
    }

    return {
        'colors': colors,
        'glass': glass,
        'typography': typography,
        'spacing': spacing,
        'layout': layout,
        'borders': borders,
        'shadows': shadows,
        'transitions': transitions,
        'z-index': z_index
    }

def format_output(tokens, fmt):
    if fmt == 'json':
        return json.dumps(tokens, indent=2)
    elif fmt == 'css' or fmt == 'scss':
        lines = []
        if fmt == 'css':
            lines.append('/* ============================================')
            lines.append('   AidSec Design Tokens - Generated System')
            lines.append('   ============================================ */')
            lines.append('')
            lines.append(':root {')
            prefix = '--'
        else:
            prefix = '$'
            
        for category, items in tokens.items():
            if fmt == 'css':
                lines.append(f'  /* -- {category.title()} -- */')
            else:
                lines.append(f'// -- {category.title()} --')
                
            for key, val in items.items():
                if fmt == 'css':
                    lines.append(f'  {prefix}{key}: {val};')
                else:
                    lines.append(f'{prefix}{key}: {val};')
            lines.append('')
            
        if fmt == 'css':
            lines.append('}')
        return '\n'.join(lines)

def main():
    parser = argparse.ArgumentParser(description='UI Design System Token Generator')
    parser.add_argument('brand_color', help='Base brand color in hex (e.g. #0b1d3a)')
    parser.add_argument('style', choices=['modern', 'classic', 'playful'], help='Visual style')
    parser.add_argument('format', choices=['json', 'css', 'scss'], help='Output format')
    parser.add_argument('-o', '--output', help='Output file path')
    
    args = parser.parse_args()
    
    tokens = generate_tokens(args.brand_color, args.style)
    output = format_output(tokens, args.format)
    
    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(output)
            f.write('\n')
    else:
        print(output)

if __name__ == '__main__':
    main()
