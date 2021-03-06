
makeElementType("display-value", {

    // Specification options:
    //   as - if "html", don't HTML escape the value

    _initElement: function(specification, description) {
        this._escapeHtml = (specification.as !== "html");
    },

    _pushRenderedHTML: function(instance, renderForm, context, nameSuffix, validationFailure, output) {
        var value = this._getValueFromDoc(context);
        if(value === null || value === undefined) { value = ""; }
        var outputText = this._escapeHtml ? escapeHTML(""+value) : ""+value;
        output.push(outputText);
    },

    _updateDocument: function(instance, context, nameSuffix, submittedDataFn) {
        if(this._shouldExcludeFromUpdate(instance, context)) { return false; }
        // If there is a value in the document, it should count as the user having entered something.
        // This is so repeating sections won't delete rows with displayed data.
        var value = this._getValueFromDoc(context);
        return (value !== null) && (value !== undefined);
    }

});
