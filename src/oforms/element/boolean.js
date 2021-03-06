
makeElementType("boolean", {

    _initElement: function(specification, description) {
        this._trueLabel  = escapeHTML(textTranslate(specification.trueLabel  || MESSAGE_DEFAULT_BOOLEAN_LABEL_TRUE));
        this._falseLabel = escapeHTML(textTranslate(specification.falseLabel || MESSAGE_DEFAULT_BOOLEAN_LABEL_FALSE));
        if(specification.style === "confirm") {
            this._checkboxStyle = true;
            this._isConfirmation = true;
            this._notConfirmedMessage = specification.notConfirmedMessage; // doesn't require escaping
            this._required = true;  // element is required (makes _wouldValidate() work)
        } else if(specification.style === "checkbox") {
            this._checkboxStyle = true;
        } else if(specification.style === "checklist") {
            this._checkboxStyle = true;
            this._withTickOrCross = true;
        }
        if(this._checkboxStyle || this._isConfirmation) {
            // Move the label to the element
            this._cbLabel = this.label;
            this.label = '';
        }
    },

    _pushRenderedHTML: function(instance, renderForm, context, nameSuffix, validationFailure, output) {
        var value = this._getValueFromDoc(context);
        if(renderForm) {
            if(this._checkboxStyle) {
                output.push('<span class="oforms-checkbox', additionalClass(this._class), '"');
                this._outputCommonAttributes(output);
                output.push('><label class="checkbox"><input type="checkbox" name="', this.name, nameSuffix, '" value="t"', ((value === true) ? ' checked' : ''),
                    '>', this._cbLabel, '</span>');
            } else {
                output.push('<span class="oforms-boolean', additionalClass(this._class), '"');
                this._outputCommonAttributes(output);
                output.push(
                    '>',
                        '<label class="radio"><input type="radio" name="', this.name, nameSuffix, '" value="t"', ((value === true) ? ' checked' : ''),  '>', this._trueLabel,  '</label>',
                        '<label class="radio"><input type="radio" name="', this.name, nameSuffix, '" value="f"', ((value === false) ? ' checked' : ''), '>', this._falseLabel, '</label>',
                    '</span>'
                );
            }
        } else {
            if(this._withTickOrCross) {
                output.push('<div>', value ? '<span class="oform-checklist-true">&#10003;</span> ' : '<span class="oform-checklist-false">X</span> ');
                output.push(_.escape(this._cbLabel), '</div>');
            } else {
                if(value !== undefined) {
                    output.push(value ? this._trueLabel : this._falseLabel);
                }
            }
        }
    },

    _replaceValuesForView: function(instance, context) {
        var value = this._getValueFromDoc(context);
        if(undefined === value) { return; }
        this._setValueInDoc(context, value ? this._trueLabel : this._falseLabel);
    },

    _decodeValueFromFormAndValidate: function(instance, nameSuffix, submittedDataFn, validationResult, context) {
        var text = submittedDataFn(this.name + nameSuffix);
        if(text === 't') { return true; }
        // If it's a checkbox, it wasn't checked if we get this far. So if it's a style:"confirm" element, validation has failed.
        if(this._isConfirmation) {
            validationResult._failureMessage = this._notConfirmedMessage || MESSAGE_CONFIRM_NOT_CHECKED;
            return undefined;
        }
        // If this is a checkbox, then no parameter means false
        if((text === 'f') || this._checkboxStyle) { return false; }
        return undefined;
    },

    _valueWouldValidate: function(value) {
        if(this._isConfirmation && (value !== true)) { return false; }
        return (value !== undefined);
    }
});
