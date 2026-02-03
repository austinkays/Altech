# Altech Field Lead - Copilot Instructions

## Project Overview

Altech Field Lead is an insurance intake web application designed for field agents to collect comprehensive client information for home and auto insurance quotes. The application provides a multi-step form interface optimized for mobile devices with a clean, Apple-inspired design.

## Technology Stack

- **Frontend**: Vanilla JavaScript (ES6+)
- **Markup**: HTML5
- **Styling**: CSS3 with custom properties (CSS variables)
- **Data Management**: LocalStorage for client-side persistence
- **No Build Process**: Direct HTML/CSS/JS without bundlers or transpilers
- **No Framework**: Pure vanilla JavaScript, no React/Vue/Angular

## Project Structure

```
/
├── index.html          # Main application file (contains HTML, CSS, and JavaScript)
├── README.md           # Project documentation
├── .gitignore          # Git ignore rules
└── Data_Importer_Template_-_AllFields_6x (1).xls  # Reference template
```

## Code Style and Conventions

### JavaScript

- **ES6+ Features**: Use modern JavaScript features (const/let, arrow functions, template literals, etc.)
- **Object-Oriented Approach**: Main application logic is in an `App` object with methods
- **Data Management**: All form data stored in `App.data` object
- **LocalStorage**: Use for client-side data persistence with JSON serialization
- **Event Handling**: Use addEventListener for all event bindings
- **Naming Conventions**:
  - camelCase for variables and function names
  - PascalCase for constructor functions (if any)
  - Descriptive names that reflect purpose

### HTML

- **Semantic HTML**: Use appropriate semantic elements (header, main, footer, section, etc.)
- **Accessibility**: Include proper ARIA labels and attributes where needed
- **Form Structure**:
  - Group related fields logically
  - Use labels with proper `for` attributes
  - Include placeholders and autocomplete attributes
- **Mobile-First**: Design for mobile viewport with `viewport-fit=cover` for safe areas
- **Progressive Web App Features**: Include Apple-specific meta tags for app-like experience

### CSS

- **CSS Variables**: Use CSS custom properties defined in `:root` for theming
- **Apple-Inspired Design System**:
  - Color scheme: Use predefined colors (`--apple-blue`, `--bg`, `--text`, etc.)
  - Typography: System fonts (-apple-system, BlinkMacSystemFont)
  - Border radius: Consistent rounded corners (12px, 14px, 16px)
  - Shadows: Subtle shadows for depth
- **Responsive Design**: Mobile-first with considerations for safe areas
- **Transitions**: Smooth transitions (0.2s, 0.3s) for interactive elements
- **BEM-like Naming**: Use descriptive, hyphenated class names

## Application Architecture

### Multi-Step Form Flow

The application supports three workflows:
1. **Home Only**: Steps 1 → 2 → 3 → 4
2. **Auto Only**: Steps 1 → 3 → 4
3. **Both (Home + Auto)**: Steps 1 → 2 → 3 → 4

### Data Structure

Form data is organized with prefixed field mappings:
- **A1-A10**: Client Demographics
- **B1-B10**: Property Information
- **L1-L10**: Property & Liability
- **C1-C10**: Auto & Driver Risk
- **R1-R10**: Admin & Underwriting

### Key Features

1. **Auto-save**: All form inputs automatically save to localStorage on change
2. **Progress Tracking**: Visual progress bar and step indicators
3. **Dynamic Forms**: Show/hide sections based on insurance type selection
4. **Data Export**: Generate Excel data for import into insurance systems
5. **Mobile Optimization**: Full-screen mobile app experience with safe area support

## Development Guidelines

### Making Changes

1. **Single File Application**: All code is in `index.html` - avoid splitting unless absolutely necessary
2. **Minimal Dependencies**: Do not add external libraries or frameworks
3. **Backward Compatibility**: Ensure changes work on modern mobile browsers (iOS Safari, Chrome, etc.)
4. **Testing**: Test on mobile viewports and verify localStorage persistence
5. **Performance**: Keep the application lightweight and fast-loading

### Adding New Features

- **New Form Fields**: Add to appropriate step section with proper data binding
- **New Steps**: Update `workflows` object and `stepTitles` mapping
- **New Field Mappings**: Add to the tags array in the data export function
- **New Styles**: Add to the existing `<style>` block using CSS variables

### Data Privacy

- **Client-Side Only**: All data stored locally in browser
- **No Server Communication**: Application does not send data to external servers
- **Data Export**: Users manually export data for import into their systems

## Best Practices

1. **Keep It Simple**: Favor vanilla JavaScript over complex abstractions
2. **Mobile First**: Always test and design for mobile viewports
3. **Accessibility**: Maintain keyboard navigation and screen reader compatibility
4. **Progressive Enhancement**: Ensure core functionality works without advanced features
5. **Clear Comments**: Add comments for complex logic or business rules
6. **Consistent Formatting**: Maintain consistent indentation and code style
7. **Error Handling**: Add appropriate error handling for user inputs and localStorage operations

## Testing Considerations

- Test on iOS Safari (primary target platform)
- Verify all form inputs save correctly to localStorage
- Check multi-step navigation works in all workflows
- Ensure responsive design works across device sizes
- Validate data export generates correct Excel format
- Test safe area insets on devices with notches

## File Management

- **gitignore**: Excel/Word documents, PDFs, build artifacts, dependencies, and OS files are ignored
- **Repository Files**: Only commit source code and documentation
- **Templates**: Reference Excel template is tracked but should not be modified by code

## Notes

- This is a client-side only application with no backend
- The application is optimized for insurance field agents on mobile devices
- Focus on simplicity, performance, and user experience
- Maintain the Apple-inspired design aesthetic throughout
