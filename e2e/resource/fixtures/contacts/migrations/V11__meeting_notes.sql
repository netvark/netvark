-- A meeting with a contact needs no notes, which is what
-- meetings_contact_or_notes allows: the required_note domain refused every
-- NULL, so the CHECK could never fail and its validator never refuse
-- (resource SPEC 7.2, 15.4).
alter table meetings alter column notes type text;
