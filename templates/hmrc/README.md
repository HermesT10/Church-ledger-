# HMRC Gift Aid ODS Template

Place the official GOV.UK Gift Aid donations schedule ODS here:

`templates/hmrc/R68GAD_V1_00_0_EN.ods`

The export service reads this file directly and preserves the HMRC workbook layout,
formatting, formulas, and `R68GAD_V1_00_0_EN` worksheet name. If the file is
missing, the schedule preview and export are blocked.

You can override the path with `HMRC_GIFT_AID_ODS_TEMPLATE_PATH` when the official
template is supplied outside the repository.
