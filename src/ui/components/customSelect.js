const enhancedRegistry = new WeakMap();
let openInstance = null;

function getPlaceholder(select, config) {
  if (config?.placeholder) return config.placeholder;
  const placeholder = select?.dataset?.placeholder;
  if (typeof placeholder === 'string' && placeholder.trim()) {
    return placeholder.trim();
  }
  const firstOption = select?.querySelector('option');
  if (firstOption && firstOption.value === '') {
    return firstOption.textContent?.trim() || 'Select an option';
  }
  return 'Select an option';
}

function getEmptyMessage(select, config) {
  if (config?.emptyMessage) return config.emptyMessage;
  const attr = select?.dataset?.emptyMessage;
  if (typeof attr === 'string' && attr.trim()) {
    return attr.trim();
  }
  return 'No options available';
}

function closeDropdown(state) {
  if (!state.open) return;
  state.open = false;
  state.wrapper.classList.remove('custom-select--open');
  state.button.setAttribute('aria-expanded', 'false');
  state.list.setAttribute('aria-hidden', 'true');
  state.list.setAttribute('tabindex', '-1');
  document.removeEventListener('pointerdown', state.handleOutsidePointer);
  document.removeEventListener('keydown', state.handleGlobalKeyDown);
  openInstance = openInstance === state ? null : openInstance;
}

function focusOption(state, index) {
  if (state.options.length === 0) {
    state.focusIndex = -1;
    return;
  }

  const bounded = Math.max(0, Math.min(index, state.options.length - 1));
  state.focusIndex = bounded;

  state.options.forEach((option, idx) => {
    if (!option.element) return;
    option.element.classList.toggle('is-highlighted', idx === state.focusIndex);
    if (idx === state.focusIndex) {
      option.element.focus({ preventScroll: true });
      option.element.scrollIntoView({ block: 'nearest' });
    }
  });
}

function openDropdown(state) {
  if (state.open || state.button.disabled) return;

  if (openInstance && openInstance !== state) {
    closeDropdown(openInstance);
  }

  state.open = true;
  state.wrapper.classList.add('custom-select--open');
  state.button.setAttribute('aria-expanded', 'true');
  state.list.setAttribute('aria-hidden', 'false');
  state.list.setAttribute('tabindex', '0');
  openInstance = state;

  const selectedIndex = state.options.findIndex((option) => option.native.selected && !option.native.disabled && !option.native.hidden);
  const firstAvailable = state.options.findIndex((option) => !option.native.disabled && !option.native.hidden);
  const initialIndex = selectedIndex >= 0 ? selectedIndex : firstAvailable;
  if (initialIndex >= 0) {
    // Delay focus so the dropdown is fully visible first.
    requestAnimationFrame(() => {
      focusOption(state, initialIndex);
    });
  }

  document.addEventListener('pointerdown', state.handleOutsidePointer);
  document.addEventListener('keydown', state.handleGlobalKeyDown);
}

function selectOption(state, optionConfig, { close = true } = {}) {
  if (!optionConfig || optionConfig.native.disabled) return;

  const { select } = state;
  const previous = select.value;
  if (previous !== optionConfig.native.value) {
    select.value = optionConfig.native.value;
    const changeEvent = new Event('change', { bubbles: true });
    select.dispatchEvent(changeEvent);
  }
  state.api.refresh();
  if (close) {
    closeDropdown(state);
    state.button.focus({ preventScroll: true });
  }
}

function syncDisabledState(state) {
  const disabled = state.select.disabled;
  state.button.disabled = disabled;
  state.wrapper.classList.toggle('custom-select--disabled', disabled);
  if (disabled) {
    closeDropdown(state);
  }
}

function updateDisplay(state) {
  const { select, label, config } = state;
  const selectedOption = select.selectedOptions?.[0];
  const text = selectedOption && selectedOption.textContent?.trim()
    ? selectedOption.textContent.trim()
    : getPlaceholder(select, config);
  label.textContent = text;
}

function highlightSelected(state) {
  const { select } = state;
  state.options.forEach((option) => {
    const isSelected = select.value === option.native.value;
    option.element?.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    option.element?.classList.toggle('is-selected', isSelected);
  });
}

function clearOptions(state) {
  state.list.innerHTML = '';
  state.options = [];
  state.focusIndex = -1;
}

function createOptionElement(state, nativeOption, index) {
  const optionButton = document.createElement('button');
  optionButton.type = 'button';
  optionButton.className = 'custom-select__option';
  optionButton.dataset.value = nativeOption.value;
  optionButton.setAttribute('role', 'option');
  optionButton.textContent = nativeOption.textContent?.trim() || nativeOption.value || '';
  optionButton.disabled = !!nativeOption.disabled;
  optionButton.setAttribute('aria-disabled', nativeOption.disabled ? 'true' : 'false');
  if (nativeOption.disabled) {
    optionButton.tabIndex = -1;
  } else {
    optionButton.tabIndex = -1;
  }

  optionButton.addEventListener('click', (event) => {
    event.preventDefault();
    selectOption(state, state.options[index]);
  });

  optionButton.addEventListener('mousemove', () => {
    if (!state.open) return;
    if (state.focusIndex !== index) {
      focusOption(state, index);
    }
  });

  return optionButton;
}

function syncOptions(state) {
  clearOptions(state);

  const { select, list, config } = state;
  const children = Array.from(select.children);

  if (!children.length) {
    const empty = document.createElement('div');
    empty.className = 'custom-select__empty';
    empty.textContent = getEmptyMessage(select, config);
    list.appendChild(empty);
    return;
  }

  let optionIndex = 0;

  children.forEach((child) => {
    if (child.tagName === 'OPTGROUP') {
      const groupLabel = document.createElement('div');
      groupLabel.className = 'custom-select__group-label';
      groupLabel.textContent = child.label || '';
      list.appendChild(groupLabel);
      const groupOptions = Array.from(child.children).filter((node) => node.tagName === 'OPTION');
      groupOptions.forEach((option) => {
        if (option.hidden) return;
        const optionElement = createOptionElement(state, option, optionIndex);
        list.appendChild(optionElement);
        state.options.push({ native: option, element: optionElement });
        optionIndex += 1;
      });
      return;
    }

    if (child.tagName === 'OPTION') {
      if (child.hidden) return;
      const optionElement = createOptionElement(state, child, optionIndex);
      list.appendChild(optionElement);
      state.options.push({ native: child, element: optionElement });
      optionIndex += 1;
    }
  });

  if (!state.options.length) {
    list.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'custom-select__empty';
    empty.textContent = getEmptyMessage(select, config);
    list.appendChild(empty);
  }
}

function handleButtonKeyDown(event, state) {
  switch (event.key) {
    case ' ': // Space
    case 'Enter':
      event.preventDefault();
      if (state.open) {
        closeDropdown(state);
      } else {
        openDropdown(state);
      }
      break;
    case 'ArrowDown':
    case 'ArrowUp':
      event.preventDefault();
      if (!state.open) {
        openDropdown(state);
      } else if (state.options.length) {
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        const nextIndex = state.focusIndex >= 0 ? state.focusIndex + delta : (event.key === 'ArrowDown' ? 0 : state.options.length - 1);
        focusOption(state, nextIndex);
      }
      break;
    case 'Home':
    case 'PageUp':
      if (!state.open) {
        openDropdown(state);
      }
      event.preventDefault();
      focusOption(state, 0);
      break;
    case 'End':
    case 'PageDown':
      if (!state.open) {
        openDropdown(state);
      }
      event.preventDefault();
      focusOption(state, state.options.length - 1);
      break;
    default:
      break;
  }
}

function handleListKeyDown(event, state) {
  switch (event.key) {
    case 'Escape':
      event.preventDefault();
      closeDropdown(state);
      state.button.focus({ preventScroll: true });
      break;
    case 'ArrowDown':
    case 'ArrowRight':
      event.preventDefault();
      focusOption(state, state.focusIndex + 1);
      break;
    case 'ArrowUp':
    case 'ArrowLeft':
      event.preventDefault();
      focusOption(state, state.focusIndex - 1);
      break;
    case 'Home':
    case 'PageUp':
      event.preventDefault();
      focusOption(state, 0);
      break;
    case 'End':
    case 'PageDown':
      event.preventDefault();
      focusOption(state, state.options.length - 1);
      break;
    case ' ': // Space
    case 'Enter':
      event.preventDefault();
      if (state.focusIndex >= 0) {
        selectOption(state, state.options[state.focusIndex]);
      }
      break;
    default:
      break;
  }
}

function enhanceSelect(select, config = {}) {
  if (!select) return null;

  const existing = enhancedRegistry.get(select);
  if (existing) {
    if (config && Object.keys(config).length) {
      existing.state.config = { ...existing.state.config, ...config };
    }
    existing.api.refresh();
    return existing.api;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'custom-select';
  select.parentNode.insertBefore(wrapper, select);
  wrapper.appendChild(select);

  const originalClasses = Array.from(select.classList || []);
  select.classList.add('custom-select__native');
  select.tabIndex = -1;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = ['custom-select__button', ...originalClasses.filter(Boolean)].join(' ');
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  const label = document.createElement('span');
  label.className = 'custom-select__label';
  button.appendChild(label);
  wrapper.appendChild(button);

  const list = document.createElement('div');
  list.className = 'custom-select__dropdown';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-hidden', 'true');
  wrapper.appendChild(list);

  const controlIdBase = select.id || `custom-select-${Math.random().toString(36).slice(2)}`;
  const listId = `${controlIdBase}-listbox`;
  const buttonId = `${controlIdBase}-button`;
  button.id = buttonId;
  list.id = listId;
  button.setAttribute('aria-controls', listId);
  list.setAttribute('aria-labelledby', buttonId);

  const state = {
    select,
    wrapper,
    button,
    list,
    label,
    options: [],
    focusIndex: -1,
    open: false,
    config: {
      placeholder: getPlaceholder(select, config),
      emptyMessage: getEmptyMessage(select, config)
    },
    api: null,
    handleOutsidePointer: null,
    handleGlobalKeyDown: null
  };

  const api = {
    refresh: () => {
      syncDisabledState(state);
      updateDisplay(state);
      highlightSelected(state);
    },
    open: () => openDropdown(state),
    close: () => closeDropdown(state)
  };
  state.api = api;

  state.handleOutsidePointer = (event) => {
    if (!state.wrapper.contains(event.target)) {
      closeDropdown(state);
    }
  };

  state.handleGlobalKeyDown = (event) => {
    if (event.key === 'Tab') {
      closeDropdown(state);
    }
  };

  button.addEventListener('click', (event) => {
    event.preventDefault();
    if (state.open) {
      closeDropdown(state);
    } else {
      openDropdown(state);
    }
  });

  button.addEventListener('keydown', (event) => handleButtonKeyDown(event, state));
  list.addEventListener('keydown', (event) => handleListKeyDown(event, state));

  select.addEventListener('change', () => {
    api.refresh();
  });

  const observer = new MutationObserver(() => {
    syncOptions(state);
    api.refresh();
  });

  observer.observe(select, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['label', 'value', 'disabled', 'hidden']
  });

  state.observer = observer;

  syncOptions(state);
  api.refresh();

  enhancedRegistry.set(select, { state, api });
  return api;
}

export { enhanceSelect };
