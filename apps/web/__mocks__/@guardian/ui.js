// Mock implementations for @guardian/ui components
module.exports = {
  Avatar: ({ profile, size, className }) => {
    const React = require('react')
    return React.createElement('div', {
      'data-testid': 'avatar',
      'data-size': size,
      className: `avatar ${className || ''}`.trim(),
    }, `Avatar: ${profile?.display_name || 'No profile'}`)
  },
  
  Dropdown: ({ children, trigger, align }) => {
    const React = require('react')
    return React.createElement('div', {
      'data-testid': 'dropdown',
      'data-align': align
    }, [
      React.createElement('div', {
        'data-testid': 'dropdown-trigger',
        key: 'trigger'
      }, trigger),
      React.createElement('div', {
        'data-testid': 'dropdown-content',
        key: 'content'
      }, children)
    ])
  },
  
  DropdownItem: ({ onClick, children, active, disabled, className }) => {
    const React = require('react')
    return React.createElement('button', {
      onClick,
      'data-testid': 'dropdown-item',
      'data-active': active,
      disabled,
      className: `dropdown-item ${className || ''}`.trim(),
    }, children)
  },
  
  DropdownDivider: () => {
    const React = require('react')
    return React.createElement('hr', {
      'data-testid': 'dropdown-divider',
      className: 'dropdown-divider'
    })
  }
}