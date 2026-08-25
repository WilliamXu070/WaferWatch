# Process Flow form-field identities

## Symptom

Chrome reports that several Process Flow form controls have neither an `id` nor a `name`, reducing reliable browser autofill and diagnostic clarity.

## Repair

Give every native Process Flow field a stable, unique `id` and/or `name`, including the global search input, inline step editor, step-template parameters, parameter-entry fields, reviewer selector, and archive restore selector. Dynamic identities include the process-step, parameter, or wafer ID to remain unique when multiple controls render.

## Verification

The form-field identity test scans every native Process Flow form control and fails if a control lacks both attributes.
