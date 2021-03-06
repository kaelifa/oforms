
// Filled in as constructors are created
var /* seal */ elementConstructors = {};

// A function to generate the constructors
var makeElementType = oForms._makeElementType = function(typeName, methods, valuePathOptional) {
    var constructor = elementConstructors[typeName] = function(specification, parentSection, description) {
        this.parentSection = parentSection;
        // First, copy the properties from the specification which apply to every element
        this.name = specification.name;
        this.label = textTranslate(specification.label);
        if(specification.explanation) {
            // TODO: Explanation might want to be shown in more than just the default template?
            this._explanationHTML = paragraphTextToHTML(textTranslate(specification.explanation));
        }
        this.valuePath = specification.path;
        if(specification.required) {
            // Two flags set, allowing the template to render the marker, but allow the internal mechanism to be sidestepped by elements.
            this.required = true;   // shortcut flag for template rendering
            this._required = specification.required;  // statements used in _doValidation
        }
        this.defaultValue = specification.defaultValue;         // before _createGetterAndSetter() is called
        // And some properties which apply to many elements
        this._id = specification.id;
        this._class = specification["class"]; // reserved word
        this._placeholder = textTranslate(specification.placeholder);
        this._guidanceNote = textTranslate(specification.guidanceNote);
        this._inlineGuidanceNote = (typeof(specification.inlineGuidanceNote) === "string") ? 
            textTranslate(specification.inlineGuidanceNote) :   // simple text need to be translated
            specification.inlineGuidanceNote;                   // view for rendering template, or undefined
        if(this._guidanceNote || this._inlineGuidanceNote) {
            // Guidance notes require client side scripting support, but not bundle support, as they're stored
            // in data attributes or display:none HTML elements.
            description.requiresClientUIScripts = true;
        }
        if(specification.validationCustom) {
            this._validationCustom = specification.validationCustom;
        }
        // Make sure there is a unique name
        if(!this.name) {
            // Automatically generate a name if none is specified
            this.name = description._generateDefaultElementName(this);
        }
        // Visibility
        if("include" in specification) {
            this.inDocument = this.inForm = specification.include;
        } else {
            this.inDocument = specification.inDocument;
            this.inForm = specification.inForm;
        }
        if(specification.deprecated) {
            if("inDocument" in specification || "inForm" in specification || this.required) {
                complain("spec", "Can't use deprecated with inDocument, inForm or required in element "+this.name);
            }
            this.inDocument = this.inForm = {path:specification.path, operation:"defined"};
        }
        // Make sure names don't include a '.', as this would break client side assumptions
        // unless they've been flagged as being part of a component element, where the dot
        // is needed to separate the name and the 'part' name.
        if(-1 !== this.name.indexOf('.') && !(specification._isWithinCompoundElement)) {
            complain("spec", "The name "+this.name+" shouldn't include a '.' character");
        }
        // Ensure there's a value path, create the getter and setter functions.
        if(this.valuePath) {
            this._createGetterAndSetter(this.valuePath); // after this.defaultValue set
        } else if(!valuePathOptional) {
            complain("spec", "No path specified for element "+this.name);
        }
        // Register element with description to enable lookup by name
        description._registerElement(this); // MUST be before _initElement() for correct ordering
        // Element specification initialisation
        this._initElement(specification, description);
    };
    _.extend(constructor.prototype, ElementBaseFunctions, methods);
    return constructor;
};

// TODO: Finish the conditional statements implementation, maybe just with validation which checks that statements don't refer to anything in a Element further down the form.
// Preliminary implementation has limitations when used as a conditional statement for a require or inForm property:
//  * Can only look at values inside the current context (so no peeking above the current "section with a path")
//  * Only works with values of elements declared *before* this element.
//  * Requires custom UI support (eg only showing * when actually required, or showing and hiding UI)
var evaluateConditionalStatement = function(conditionalStatement, context, instance) {
    // If a simple boolean, return that value
    if(conditionalStatement === true || conditionalStatement === false) { return conditionalStatement; }
    // Otherwise evaluate the (possibly nested) required statements
    var check = function(statement) {
        if(typeof(statement) !== "object") {
            complain("Bad conditional statement: "+statement);
        }
        var r;
        var pathValue;
        switch(statement.operation) {
            case "defined":
                r = (getByPathOrExternal(context, statement, instance._externalData) !== undefined);
                break;
            case "not-defined":
                r = (getByPathOrExternal(context, statement, instance._externalData) === undefined);
                break;
            case "=": case "==": case "===":
                r = (getByPathOrExternal(context, statement, instance._externalData) === statement.value);
                break;
            case "!=": case "!==":
                r = (getByPathOrExternal(context, statement, instance._externalData) !== statement.value);
                break;
            case "<":
                r = (getByPathOrExternal(context, statement, instance._externalData) < statement.value);
                break;
            case "<=":
                r = (getByPathOrExternal(context, statement, instance._externalData) <= statement.value);
                break;
            case ">":
                r = (getByPathOrExternal(context, statement, instance._externalData) > statement.value);
                break;
            case ">=":
                r = (getByPathOrExternal(context, statement, instance._externalData) >= statement.value);
                break;
            case "contains":
                r = ecsGetContains(context, statement, instance._externalData);
                break;
            case "not-contains":
                r = !ecsGetContains(context, statement, instance._externalData);
                break;
            case "minimum-count": 
                pathValue = getByPathOrExternal(context, statement, instance._externalData);
                if(_.isArray(pathValue)) { // only makes sense for multiples
                    r = (pathValue.length > statement.value);
                } else { r = false; }
                break;
            case "AND":
                r = true;
                _.each(statement.statements || [], function(st) {
                    if(!check(st)) { r = false; }
                });
                break;
            case "OR":
                r = false;
                _.each(statement.statements || [], function(st) {
                    if(check(st)) { r = true; }
                });
                break;
            default:
                complain("Unknown required operation: "+statement.operation);
                break;
        }
        return r;
    };
    return check(conditionalStatement);
};

var ecsGetContains = function(context, statement, externalData) {
    var pathValue = getByPathOrExternal(context, statement, externalData);
    if(_.isArray(pathValue)) { // only makes sense for multiples
        return _.contains(pathValue, statement.value);
    }
    return false;
};


// Base functionality of Elements
var ElementBaseFunctions = {
    // Public properties -- available to templates in the 'definitions' property, eg label is used for column headings.
    //  name - name of element, suitable for outputing as an HTML name element
    //  label - optional label
    //  valuePath - path of the value within the document, relative to the context
    //  required - whether this is a required element
    //  defaultValue - the default value to use if there isn't an element in the document
    //
    // Properties copied from the specification which are used by more than one Element
    //  _id - the id="" attribute for the element - use this._outputCommonAttributes()
    //  _placeholder - the placeholder="" attribute for the element - use this._outputCommonAttributes()
    //  _class - the class="" attribute for the element (added to oForms classes) - use additionalClass(this._class) or this._outputCommonAttributes(output, true)

    // Called by the constructor to create the value getter and setter functions.
    _createGetterAndSetter: function(valuePath) {
        if(valuePath == '.') {
            // Special case for . path, used for repeating-sections over plain values in an array.
            // Get/sets the value from the '.' property, and repeating sections have a matching special case.
            // No support for default values.
            this._getValueFromDoc = function(context) {
                if(undefined === context) { return undefined; }
                return context['.'];
            };
            this._setValueInDoc = function(context, value) {
                if(undefined === value) {
                    delete context['.'];
                } else {
                    context['.'] = value;
                }
            };
        } else {
            // Normal getter and setters.
            // Getter will return the defaultValue if the value === undefined.
            var route = valuePath.split('.');
            var lastKey = route.pop();
            var defaultValue = this.defaultValue;
            this._getValueFromDoc = function(context) {
                var position = context;
                for(var l = 0; l < route.length && undefined !== position; ++l) {
                    position = position[route[l]];
                }
                if(undefined === position) { return undefined; }
                var value = position[lastKey];
                // If the value is undefined, return the default value instead. This may also be undefined.
                return (undefined === value) ? defaultValue : value;
            };
            this._setValueInDoc = function(context, value) {
                var position = context;
                for(var l = 0; l < route.length; ++l) {
                    var nextPosition = position[route[l]];
                    if(undefined === nextPosition) {
                        // Create a new element if there's nothing in the document at this point
                        nextPosition = position[route[l]] = {};
                    }
                    position = nextPosition;
                }
                if(undefined === value) {
                    delete position[lastKey];
                } else {
                    position[lastKey] = value;
                }
            };
        }
    },

    // Default getter function which returns null. This makes sure that every Element has a getter function, so
    // the section renderDocumentOmitEmpty option always has something to check and, for sections, it doesn't return
    // an undefined value which would cause the section to be ommitted.
    _getValueFromDoc: function() {
        return null; // do *NOT* return undefined
    },

    // Bundle up client side resources into a JSON structure.
    // Element information goes in bundle.elements[element_name]
    // emptyInstance is a FormInstance with an empty document, used for rendering.
    // The FormDescription can be accessed through emptyInstance.
    _bundleClientRequirements: function(emptyInstance, bundle) {
        // Do nothing
    },

    // Called by the constructor to initialize the element
    _initElement: function(specification, description) {
    },

    // Push rendered HTML strings to an output array, returns nothing.
    // Implemented this way for speed and space efficiency.
    // validationFailure is undefined for values which haven't failed validation or are the initial
    // values from the form, or the validation error message as a string.
    _pushRenderedHTML: function(instance, renderForm, context, nameSuffix, validationFailure, output) {
        complain("internal");
    },

    // For outputting common attributes
    _outputCommonAttributes: function(output, withClass) {
        outputAttribute(output, ' id="', this._id);
        outputAttribute(output, ' placeholder="', this._placeholder);
        outputAttribute(output, ' data-oforms-note="', this._guidanceNote);
        if(withClass) {
            outputAttribute(output, ' class="', this._class);
        }
    },

    // Must be called first in the _updateDocument function to check conditional in the context containing the element.
    _shouldExcludeFromUpdate: function(instance, context) {
        return ((this.inForm !== undefined) && !(evaluateConditionalStatement(this.inForm, context, instance)));
    },

    // Call a custom validation function, which returns a message if validation fails.
    // NOTE - Some element types will call this early
    _callValidationCustomMaybe: function(value, context, instance) {
        if(!this._validationCustom) { return; }
        var name = this._validationCustom.name;
        if(!name) { complain("spec", "validationCustom without a name property"); }
        var validFn = (instance._customValidationFns || {})[name] ||
            (instance.description.delegate.customValidationFunctions || {})[name] ||
            standardCustomValidationFunctions[name];
        if(!validFn) { complain("instance", "validationCustom uses name which has not been registered: "+name); }
        return validFn(value, this._validationCustom.data || {}, context, instance.document, instance._externalData || {});
    },

    // Update the document
    // Returns true if the value should be considered as the user having entered something
    // for determining whether a user has entered in a field.
    _updateDocument: function(instance, context, nameSuffix, submittedDataFn) {
        if(this._shouldExcludeFromUpdate(instance, context)) { return false; }
        // Results of validation are stored in this object by _decodeValueFromFormAndValidate. Keys:
        //    _failureMessage - message to display if it failed
        //    _isEmptyField - true if the field was an empty field
        var validationResult = {};
        // Decode the value and do validation, then store the result in the document.
        var value = this._decodeValueFromFormAndValidate(instance, nameSuffix, submittedDataFn, validationResult, context);
        this._setValueInDoc(context, value);
        // Handle validation results and required fields, storing any errors in the instance.
        var failureMessage = validationResult._failureMessage;
        if(this._required && !(failureMessage) && evaluateConditionalStatement(this._required, context, instance)) {
            if(undefined === value || validationResult._isEmptyField) {
                failureMessage = MESSAGE_REQUIRED_FIELD;
            }
        }
        if(!(failureMessage) && (value !== undefined)) {
            // Some elements will have called this already
            failureMessage = this._callValidationCustomMaybe(value, context, instance);
        }
        if(failureMessage) {
            instance._validationFailures[this.name + nameSuffix] = failureMessage;
        }
        // If the value is the default value, assume the user didn't enter it
        return (value !== undefined) && (value !== this.defaultValue);
    },

    // Retrieve the value from the data entered into the form
    _decodeValueFromFormAndValidate: function(instance, nameSuffix, submittedDataFn, validationResult, context) {
        return undefined;
    },

    _valueWouldValidate: function(value) {
        return (value !== undefined);
    },

    // Elements which override need to check _shouldExcludeFromUpdate() and return true if excluded.
    _wouldValidate: function(instance, context) {
        if(this._shouldExcludeFromUpdate(instance, context)) { return true; }
        var value = this._getValueFromDoc(context);
        if(value === undefined) {
            return !(this._required && evaluateConditionalStatement(this._required, context, instance));
        } else {
            if(this._callValidationCustomMaybe(value, context, instance)) {
                return false;
            }
        }
        return this._valueWouldValidate(value);
    },

    _shouldShowAsRequiredInUI: function(instance, context) {
        return this._required && evaluateConditionalStatement(this._required, context, instance);
    },

    // Replace values in a document for the view
    _replaceValuesForView: function(instance, context) {
        // Do nothing in the base class - many elements are quite happy with the value in the document
        // being used as the display value.
    }
};
