-- Z142. The status an archive replaced, so unarchive restores it: an
-- unsubscribed or complained contact comes back as it was, never active. NULL
-- for contacts not archived and for those archived before this column.
ALTER TABLE "contacts" ADD COLUMN "archived_from" "contact_status";