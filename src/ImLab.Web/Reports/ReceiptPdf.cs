// Builds the booking receipt as a real PDF using QuestPDF (fluent API).
// Called by the GET /bookings/{id}/receipt.pdf endpoint; the Angular screen
// downloads the bytes straight to disk - no new tab, no print dialog.
using ImLab.Models.Services;
using ImLab.Models.ViewModels;
using QuestPDF.Fluent;
using QuestPDF.Helpers;

namespace ImLab.Web.Reports;

public static class ReceiptPdf
{
    public static byte[] Build(ReceiptVm r) =>
        Document.Create(doc => doc.Page(page =>
        {
            page.Size(PageSizes.A4);
            page.Margin(40);
            page.DefaultTextStyle(x => x.FontSize(11).FontColor("#0F2A3D"));

            page.Header().Column(col =>
            {
                col.Item().AlignCenter().Text(r.CompanyName).Bold().FontSize(18);
                col.Item().AlignCenter().Text($"Receipt {r.BillNo}").FontSize(10).FontColor("#5B7384");
            });

            page.Content().Column(col =>
            {
                col.Spacing(6);
                col.Item().PaddingVertical(8).LineHorizontal(1).LineColor("#B9C6CE");
                col.Item().Row(row =>
                {
                    row.RelativeItem().Text(t => { t.Span("Lab no: ").FontColor("#5B7384"); t.Span(r.LabNo.ToString()); });
                    row.RelativeItem().AlignRight().Text(t => { t.Span("Date: ").FontColor("#5B7384"); t.Span(IndianTime.FromUtc(r.BookedAt).ToString("dd/MM/yyyy, hh:mm tt") + " IST"); });
                });
                col.Item().Row(row =>
                {
                    row.RelativeItem().Text(t => { t.Span("Patient: ").FontColor("#5B7384"); t.Span(r.PatientName); });
                    row.RelativeItem().AlignRight().Text(t => { t.Span("ID: ").FontColor("#5B7384"); t.Span(r.Uid); });
                });
                col.Item().Text(t =>
                {
                    t.Span("Payment: ").FontColor("#5B7384"); t.Span(r.PaymentMode);
                    if (r.IsRebook) { t.Span("   REBOOK").Bold().FontColor("#C0392B"); }
                });
                col.Item().PaddingVertical(6).LineHorizontal(1).LineColor("#B9C6CE");

                col.Item().Table(table =>
                {
                    table.ColumnsDefinition(c => { c.RelativeColumn(4); c.RelativeColumn(2); });
                    table.Header(h => { h.Cell().Text("Test").Bold(); h.Cell().AlignRight().Text("Amount").Bold(); });
                    foreach (var l in r.Lines)
                    {
                        table.Cell().Text(l.Test);
                        table.Cell().AlignRight().Text(l.Price.ToString("N2"));
                    }
                });

                col.Item().PaddingTop(10).AlignRight().Column(tot =>
                {
                    tot.Spacing(2);
                    tot.Item().Row(x => { x.AutoItem().Text("Total"); x.ConstantItem(90).AlignRight().Text(r.Total.ToString("N2")); });
                    tot.Item().Row(x => { x.AutoItem().Text("Discount"); x.ConstantItem(90).AlignRight().Text("- " + r.Discount.ToString("N2")); });
                    tot.Item().Row(x => { x.AutoItem().Text("Paid"); x.ConstantItem(90).AlignRight().Text("- " + r.Paid.ToString("N2")); });
                    tot.Item().PaddingTop(4).BorderTop(1).BorderColor("#0F2A3D").Row(x =>
                    {
                        x.AutoItem().Text("Balance").Bold();
                        x.ConstantItem(90).AlignRight().Text(r.Balance.ToString("N2")).Bold().FontColor(r.Balance > 0 ? "#C0392B" : "#0B7A6D");
                    });
                });

                col.Item().PaddingTop(28).AlignCenter().Text("Thank you! Please bring this receipt for report collection.").FontSize(10).FontColor("#5B7384");
            });
        })).GeneratePdf();
}