-- Letterhead background lives in "fileId"; "layout" says where the text sits on it.
ALTER TABLE "DocumentTemplate" ADD COLUMN "layout" JSONB;
