import { NextResponse } from 'next/server'
import { OrderTemplate } from '@/features/receipt/templates/order'

export async function GET() {
  try {
    // Test data with various items and options
    const testOrderData = {
      storeName: 'Restaurante Teste',
      displayId: '123',
      createdAt: new Date(),
      orderType: 'DELIVERY',
      posCounterName: 'Caixa 1',
      items: [
        {
          itemName: 'X-Burguer Especial',
          quantity: 2,
          unitPrice: 25.90,
          totalPrice: 51.80,
          options: [
            { optionName: 'Bacon Extra', optionQuantity: 1, optionPrice: 5.00 },
            { optionName: 'Queijo Cheddar', optionQuantity: 2, optionPrice: 3.50 },
          ],
          comment: 'Sem cebola',
        },
        {
          itemName: 'Batata Frita Grande',
          quantity: 1,
          unitPrice: 15.00,
          totalPrice: 15.00,
          options: [],
        },
        {
          itemName: 'Refrigerante 2L',
          quantity: 1,
          unitPrice: 12.00,
          totalPrice: 12.00,
        },
        {
          itemName: 'Pizza Calabresa',
          quantity: 1,
          unitPrice: 45.00,
          totalPrice: 45.00,
          options: [
            { optionName: 'Borda Recheada', optionQuantity: 1, optionPrice: 8.00 },
            { optionName: 'Azeitona Extra', optionQuantity: 1 },  // No price - should not show
          ],
          comment: 'Bem assada',
        },
      ],
      discount: 10.00,
      totalPrice: 113.80,
      payments: [
        { method: 'CREDIT', value: 50.00 },
        { method: 'CASH', value: 50.00, changeFor: 60.00 },
        { method: 'PIX', value: 13.80 },
      ],
      customerName: 'Joao Silva',
      customerPhone: '(11) 99999-9999',
      customerAddress: 'Rua das Flores, 123 - Centro',
    }

    // Render the receipt template
    const receiptSvg = await OrderTemplate.render(testOrderData)

    // Return the SVG directly for viewing
    return new NextResponse(receiptSvg, {
      headers: {
        'Content-Type': 'image/svg+xml',
      },
    })
  } catch (error) {
    console.error('Error rendering order receipt:', error)
    return NextResponse.json(
      { error: 'Failed to render order receipt', details: String(error) },
      { status: 500 }
    )
  }
}
